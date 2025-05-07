// src/ml/processing/segmentation.ts
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

        // Bounds check
        if (curX < 0 || curX >= width || curY < 0 || curY >= height) {
            continue;
        }

        const index = (curY * width + curX);
        const labelIndex = index; // Use 1D index for labels array
        const pixelDataIndex = index * 4; // R, G, B, A

        // Check if already labeled or below threshold (background)
        // Using Red channel for threshold check (assuming grayscale or near-grayscale)
        if (labels[labelIndex] !== 0 || data[pixelDataIndex] > threshold) { // Assuming black text on white bg, threshold checks for non-background
            continue;
        }

        // Label the pixel
        labels[labelIndex] = label;
        pixelCount++;

        // Update bounding box
        minX = Math.min(minX, curX);
        minY = Math.min(minY, curY);
        maxX = Math.max(maxX, curX);
        maxY = Math.max(maxY, curY);

        // Add neighbors to stack (4-connectivity)
        stack.push([curX + 1, curY]);
        stack.push([curX - 1, curY]);
        stack.push([curX, curY + 1]);
        stack.push([curX, curY - 1]);
    }

    // Filter out tiny components (noise) - adjust threshold as needed
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (pixelCount < 10 || boxWidth < 3 || boxHeight < 3) { // Adjusted filter slightly
        return null;
    }

    return { x: minX, y: minY, width: boxWidth, height: boxHeight };
}

/**
 * Merges potential dot components (like 'i', 'j') with their stems based on relaxed heuristics.
 * Modifies the components array in place.
 */
function mergeDotComponents(components: BoundingBox[]): BoundingBox[] { // Return filtered list
    let mergedOccurred = true; // Flag to control loop
    let currentComponents = [...components]; // Work on a copy inside the loop

    while (mergedOccurred) {
        mergedOccurred = false;
        const nextComponents: BoundingBox[] = [];
        const mergedIds = new Set<number>(); // Track IDs merged in this pass

        for (let i = 0; i < currentComponents.length; i++) {
            const boxA = currentComponents[i];
            if (mergedIds.has(boxA.id)) continue; // Skip if already merged in this pass

            // let mergedIntoA = false;
            for (let j = i + 1; j < currentComponents.length; j++) {
                const boxB = currentComponents[j];
                if (mergedIds.has(boxB.id)) continue; // Skip B if already merged in this pass

                // --- Relaxed Heuristic criteria for merging boxA and boxB ---
                let dotCandidate: BoundingBox | null = null;
                let stemCandidate: BoundingBox | null = null;

                const areaA = boxA.width * boxA.height;
                const areaB = boxB.width * boxB.height;
                const aspectRatioA = boxA.height / (boxA.width || 1);
                const aspectRatioB = boxB.height / (boxB.width || 1);

                // Identify potential dot (smaller area, aspect ratio not excessively tall)
                // Identify potential stem (larger area, aspect ratio indicates taller than wide)
                // RELAXED: Removed absolute area check, increased relative area, check aspect ratios
                if (areaA < areaB * 0.6 && aspectRatioB > 1.5 && aspectRatioA < 1.5) { // A=dot, B=stem?
                    dotCandidate = boxA; stemCandidate = boxB;
                } else if (areaB < areaA * 0.6 && aspectRatioA > 1.5 && aspectRatioB < 1.5) { // B=dot, A=stem?
                    dotCandidate = boxB; stemCandidate = boxA;
                }

                if (dotCandidate && stemCandidate) {
                    // Check vertical alignment: dot is reasonably above stem
                    // Allow dot's bottom edge to be slightly below stem's top edge (e.g., 5 pixels)
                    const isAbove = (dotCandidate.y + dotCandidate.height) <= stemCandidate.y + 5;

                    // Check vertical gap: gap isn't excessively large (e.g., less than stem's height)
                    const verticalGap = stemCandidate.y - (dotCandidate.y + dotCandidate.height);
                    const reasonableGap = verticalGap >= -5 && verticalGap < stemCandidate.height; // Allow -5px overlap to stem height gap

                    // Check horizontal alignment: Center of dot is within horizontal bounds of stem
                    const dotCenterX = dotCandidate.x + dotCandidate.width / 2;
                    const stemXMin = stemCandidate.x;
                    const stemXMax = stemCandidate.x + stemCandidate.width;
                    const centerAligned = dotCenterX >= stemXMin && dotCenterX <= stemXMax;

                    // Check some horizontal pixel overlap exists (robustness check)
                     const xOverlap = Math.max(0, Math.min(dotCandidate.x + dotCandidate.width, stemCandidate.x + stemCandidate.width) - Math.max(dotCandidate.x, stemCandidate.x));
                     const hasXOverlap = xOverlap > 2; // Require at least a few pixels overlap/adjacency

                    if (isAbove && reasonableGap && centerAligned && hasXOverlap) {
                        // --- Merge condition met ---
                        log(`Merging dot (id: ${dotCandidate.id}, [${dotCandidate.x},${dotCandidate.y},${dotCandidate.width},${dotCandidate.height}]) and stem (id: ${stemCandidate.id}, [${stemCandidate.x},${stemCandidate.y},${stemCandidate.width},${stemCandidate.height}])`);

                        const mergedX = Math.min(dotCandidate.x, stemCandidate.x);
                        const mergedY = dotCandidate.y;
                        const mergedRight = Math.max(dotCandidate.x + dotCandidate.width, stemCandidate.x + stemCandidate.width);
                        const mergedBottom = stemCandidate.y + stemCandidate.height;
                        const mergedWidth = mergedRight - mergedX;
                        const mergedHeight = mergedBottom - mergedY;

                        // Create new merged box properties, keep ID of the stem? Or dot? Let's keep stem ID.
                        boxA.x = mergedX;
                        boxA.y = mergedY;
                        boxA.width = mergedWidth;
                        boxA.height = mergedHeight;
                        // Ensure the kept box (A) ID is the one we intended (stem or dot) - let's assume A is the one we keep and modify
                        boxA.id = (boxA === stemCandidate) ? stemCandidate.id : dotCandidate.id; // Keep one ID

                        log(` -> New box (id: ${boxA.id}): [${mergedX}, ${mergedY}, ${mergedWidth}, ${mergedHeight}]`);

                        mergedIds.add(boxB.id); // Mark box B for removal later
                        mergedOccurred = true;
                        // mergedIntoA = true; // Mark that box A was modified
                        break; // Stop comparing box A with other boxes in this pass, move to next i
                    }
                }
            } // End inner loop (j)

            // Add box A to the results for the next pass if it wasn't merged into another box
            if (!mergedIds.has(boxA.id)) {
                 nextComponents.push(boxA);
             }

        } // End outer loop (i)

        currentComponents = nextComponents; // Prepare for the next iteration

    } // End while(mergedOccurred) loop

    return currentComponents; // Return the final list after all merging passes
}



/**
 * Finds bounding boxes of characters, groups them into lines,
 * and inserts null markers for spaces within lines.
 * Includes heuristic merging for dots ('i', 'j').
 * Assumes dark characters on a light background.
 * @returns An array of ProcessableLine arrays.
 */
export function findCharacterBoxes(
    imageData: ImageData,
    threshold: number = 128,
): ProcessableLine[] { // <-- Return array of lines
    const { data, width, height } = imageData;
    log(`Starting multi-line character segmentation on ${width}x${height} image.`);

    const labels = new Array(width * height).fill(0);
    let currentLabel = 1;
    const initialComponents: BoundingBox[] = [];

    // 1. Find initial connected components
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
                        centerY: boxData.y + boxData.height / 2,
                        merged: false
                    });
                    currentLabel++;
                }
            }
        }
    }
    log(`Found ${initialComponents.length} initial components.`);

    // 2. Merge dot components
    const mergedComponents = mergeDotComponents(initialComponents);
    log(`Found ${mergedComponents.length} components after merging.`);

    if (mergedComponents.length === 0) return [];

    // 3. Group Components into Lines
    // Sort primarily by Y center, secondarily by X coord for vertical proximity check
    mergedComponents.sort((a, b) => {
        if (Math.abs(a.centerY - b.centerY) < (a.height + b.height) / 4) { // Consider close Y centers as same line initially
            return a.x - b.x; // Sort by X if Y is close
        }
        return a.centerY - b.centerY; // Sort by Y center
    });

    const lines: BoundingBox[][] = [];
    if (mergedComponents.length > 0) {
        let currentLine: BoundingBox[] = [mergedComponents[0]];
        let currentLineAvgY = mergedComponents[0].centerY;

        for (let i = 1; i < mergedComponents.length; i++) {
            const box = mergedComponents[i];
            const avgHeightCurrentLine = currentLine.reduce((sum, b) => sum + b.height, 0) / currentLine.length;
            // If box's center is vertically close to the current line's average center, add it
            if (Math.abs(box.centerY - currentLineAvgY) < avgHeightCurrentLine) { // Threshold: 60% of avg height
                currentLine.push(box);
                // Update running average Y for the current line
                currentLineAvgY = currentLine.reduce((sum, b) => sum + b.centerY, 0) / currentLine.length;
            } else {
                // Start a new line
                lines.push(currentLine); // Add completed line
                currentLine = [box]; // Start new line
                currentLineAvgY = box.centerY; // Reset avg Y
            }
        }
        lines.push(currentLine); // Add the last line
    }
    log(`Grouped components into ${lines.length} lines.`);

    // 4. Process each line: Sort by X, Detect Spaces, Format Output
    const resultLines: ProcessableLine[] = [];
    for (const line of lines) {
        // Sort boxes within this line by X coordinate
        line.sort((a, b) => a.x - b.x);

        const processedLine: ProcessableLine = [];
        if (line.length === 0) continue;

        // Calculate median width for this line for space detection
        const widths = line.map(c => c.width).sort((a, b) => a - b);
        const medianWidth = widths.length > 0 ? widths[Math.floor(widths.length / 2)] : 20;
        const spaceThreshold = medianWidth * 1.5; // Space gap threshold

        // Add the first character box of the line
        processedLine.push([line[0].x, line[0].y, line[0].width, line[0].height]);

        // Detect spaces within the line
        for (let i = 0; i < line.length - 1; i++) {
            const currentBox = line[i];
            const nextBox = line[i + 1];
            const gap = nextBox.x - (currentBox.x + currentBox.width);

            if (gap > spaceThreshold) {
                processedLine.push(null); // Insert space marker
            }
            processedLine.push([nextBox.x, nextBox.y, nextBox.width, nextBox.height]);
        }
        resultLines.push(processedLine);
    }

    log(`Processed ${resultLines.length} lines with spaces.`);
    return resultLines;
}