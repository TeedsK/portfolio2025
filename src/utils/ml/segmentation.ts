// src/utils/ml/segmentation.ts
import { ProcessableLine } from '../../types';
import { log } from '../../utils/logger';

interface BoundingBox {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    merged: boolean;
}
// Simple flood fill implementation for connected components
function floodFill(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
    label: number,
    labels: number[],
    threshold: number
): Omit<BoundingBox, 'id' | 'merged' | 'centerX' | 'centerY'> | null {
    const stack = [[x, y]];
    let minX = x, minY = y, maxX = x, maxY = y;
    let pixelCount = 0;

    while (stack.length > 0) {
        const [curX, curY] = stack.pop()!;

        if (curX < 0 || curX >= width || curY < 0 || curY >= height) {
            continue;
        }

        const index = (curY * width + curX);
        const labelIndex = index;
        const pixelDataIndex = index * 4;

        if (labels[labelIndex] !== 0 || data[pixelDataIndex] > threshold) {
            continue;
        }

        labels[labelIndex] = label;
        pixelCount++;

        minX = Math.min(minX, curX);
        minY = Math.min(minY, curY);
        maxX = Math.max(maxX, curX);
        maxY = Math.max(maxY, curY);

        stack.push([curX + 1, curY]);
        stack.push([curX - 1, curY]);
        stack.push([curX, curY + 1]);
        stack.push([curX, curY - 1]);
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (pixelCount < 10 || boxWidth < 3 || boxHeight < 3) {
        return null;
    }

    return { x: minX, y: minY, width: boxWidth, height: boxHeight };
}

function mergeDotComponents(components: BoundingBox[]): BoundingBox[] {
    let mergedOccurred = true;
    let currentComponents = [...components];

    while (mergedOccurred) {
        mergedOccurred = false;
        const nextComponents: BoundingBox[] = [];
        const mergedIds = new Set<number>();

        for (let i = 0; i < currentComponents.length; i++) {
            const boxA = currentComponents[i];
            if (mergedIds.has(boxA.id)) continue;

            for (let j = i + 1; j < currentComponents.length; j++) {
                const boxB = currentComponents[j];
                if (mergedIds.has(boxB.id)) continue;

                let dotCandidate: BoundingBox | null = null;
                let stemCandidate: BoundingBox | null = null;

                const areaA = boxA.width * boxA.height;
                const areaB = boxB.width * boxB.height;
                const aspectRatioA = boxA.height / (boxA.width || 1);
                const aspectRatioB = boxB.height / (boxB.width || 1);

                if (areaA < areaB * 0.6 && aspectRatioB > 1.5 && aspectRatioA < 1.5) {
                    dotCandidate = boxA; stemCandidate = boxB;
                } else if (areaB < areaA * 0.6 && aspectRatioA > 1.5 && aspectRatioB < 1.5) {
                    dotCandidate = boxB; stemCandidate = boxA;
                }

                if (dotCandidate && stemCandidate) {
                    const isAbove = (dotCandidate.y + dotCandidate.height) <= stemCandidate.y + 5;
                    const verticalGap = stemCandidate.y - (dotCandidate.y + dotCandidate.height);
                    const reasonableGap = verticalGap >= -5 && verticalGap < stemCandidate.height;
                    const dotCenterX = dotCandidate.x + dotCandidate.width / 2;
                    const stemXMin = stemCandidate.x;
                    const stemXMax = stemCandidate.x + stemCandidate.width;
                    const centerAligned = dotCenterX >= stemXMin && dotCenterX <= stemXMax;
                    const xOverlap = Math.max(0, Math.min(dotCandidate.x + dotCandidate.width, stemCandidate.x + stemCandidate.width) - Math.max(dotCandidate.x, stemCandidate.x));
                    const hasXOverlap = xOverlap > 2;

                    if (isAbove && reasonableGap && centerAligned && hasXOverlap) {
                        log(`Merging dot (id: ${dotCandidate.id}) and stem (id: ${stemCandidate.id})`);
                        const mergedX = Math.min(dotCandidate.x, stemCandidate.x);
                        const mergedY = dotCandidate.y;
                        const mergedRight = Math.max(dotCandidate.x + dotCandidate.width, stemCandidate.x + stemCandidate.width);
                        const mergedBottom = stemCandidate.y + stemCandidate.height;

                        boxA.x = mergedX;
                        boxA.y = mergedY;
                        boxA.width = mergedRight - mergedX;
                        boxA.height = mergedBottom - mergedY;
                        boxA.id = (boxA === stemCandidate) ? stemCandidate.id : dotCandidate.id;

                        mergedIds.add(boxB.id);
                        mergedOccurred = true;
                        break;
                    }
                }
            }

            if (!mergedIds.has(boxA.id)) {
                nextComponents.push(boxA);
            }
        }
        currentComponents = nextComponents;
    }
    return currentComponents;
}

export function findCharacterBoxes(
    imageData: ImageData,
    threshold: number = 128,
): ProcessableLine[] {
    const { data, width, height } = imageData;
    log(`Starting multi-line character segmentation on ${width}x${height} image.`);

    const labels = new Array(width * height).fill(0);
    let currentLabel = 1;
    const initialComponents: BoundingBox[] = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x);
            const pixelDataIndex = index * 4;

            if (data[pixelDataIndex] <= threshold && labels[index] === 0) {
                const boxData = floodFill(data, width, height, x, y, currentLabel, labels, threshold);
                if (boxData) {
                    initialComponents.push({
                        ...boxData,
                        id: currentLabel,
                        centerX: boxData.x + boxData.width / 2,
                        centerY: boxData.y + boxData.height / 2, // <-- FIX HERE
                        merged: false
                    });
                    currentLabel++;
                }
            }
        }
    }
    log(`Found ${initialComponents.length} initial components.`);

    const mergedComponents = mergeDotComponents(initialComponents);
    log(`Found ${mergedComponents.length} components after merging.`);

    if (mergedComponents.length === 0) return [];

    mergedComponents.sort((a, b) => {
        if (Math.abs(a.centerY - b.centerY) < (a.height + b.height) / 4) {
            return a.x - b.x;
        }
        return a.centerY - b.centerY;
    });

    const lines: BoundingBox[][] = [];
    if (mergedComponents.length > 0) {
        let currentLine: BoundingBox[] = [mergedComponents[0]];
        let currentLineAvgY = mergedComponents[0].centerY;

        for (let i = 1; i < mergedComponents.length; i++) {
            const box = mergedComponents[i];
            const avgHeightCurrentLine = currentLine.reduce((sum, b) => sum + b.height, 0) / currentLine.length;
            if (Math.abs(box.centerY - currentLineAvgY) < avgHeightCurrentLine) {
                currentLine.push(box);
                currentLineAvgY = currentLine.reduce((sum, b) => sum + b.centerY, 0) / currentLine.length;
            } else {
                lines.push(currentLine);
                currentLine = [box];
                currentLineAvgY = box.centerY;
            }
        }
        lines.push(currentLine);
    }
    log(`Grouped components into ${lines.length} lines.`);

    const resultLines: ProcessableLine[] = [];
    for (const line of lines) {
        line.sort((a, b) => a.x - b.x);

        const processedLine: ProcessableLine = [];
        if (line.length < 2) {
            if (line.length === 1) {
                processedLine.push([line[0].x, line[0].y, line[0].width, line[0].height]);
            }
            resultLines.push(processedLine);
            continue;
        }

        const centerDists = [];
        for (let i = 0; i < line.length - 1; i++) {
            centerDists.push(line[i + 1].centerX - line[i].centerX);
        }
        centerDists.sort((a, b) => a - b);

        const averageCharWidth = line.reduce((sum, box) => sum + box.width, 0) / line.length;
        let spaceThreshold;

        const potentialIntraWordDists = centerDists.filter(d => d < averageCharWidth);

        // if (potentialIntraWordDists.length > 1) {
            const medianIntraWordDist = potentialIntraWordDists[Math.floor(potentialIntraWordDists.length / 2)];
            spaceThreshold = medianIntraWordDist * 2.8;
        // } else {
        //     spaceThreshold = averageCharWidth * 1;
        // }

        log(`Line median center-dist: N/A (using new logic), space threshold: ${spaceThreshold.toFixed(1)}`);

        processedLine.push([line[0].x, line[0].y, line[0].width, line[0].height]);
        for (let i = 0; i < line.length - 1; i++) {
            const currentDist = line[i + 1].centerX - line[i].centerX;

            if (currentDist > spaceThreshold) {
                processedLine.push(null); // It's a space
            }
            processedLine.push([line[i + 1].x, line[i + 1].y, line[i + 1].width, line[i + 1].height]);
        }

        resultLines.push(processedLine);
    }

    log(`Processed ${resultLines.length} lines with spaces.`);
    return resultLines;
}