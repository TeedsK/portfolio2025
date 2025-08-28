// src/pages/landing/visuals/structures/PriorityQueue.ts
export class PriorityQueue<T> {
    private heap: T[] = [];
    private cmp: (a: T, b: T) => boolean;

    constructor(comparator: (a: T, b: T) => boolean) {
        this.cmp = comparator;
    }

    size() { return this.heap.length; }
    isEmpty() { return this.heap.length === 0; }

    peek(): T | undefined { return this.heap[0]; }

    push(value: T) {
        this.heap.push(value);
        this.siftUp(this.heap.length - 1);
    }

    pop(): T | undefined {
        const top = this.peek();
        const last = this.heap.pop();
        if (this.heap.length > 0 && last !== undefined) {
            this.heap[0] = last;
            this.siftDown(0);
        }
        return top;
    }

    private parent(i: number) { return ((i - 1) >> 1); }
    private left(i: number) { return (i << 1) + 1; }
    private right(i: number) { return (i << 1) + 2; }

    private siftUp(i: number) {
        while (i > 0) {
            const p = this.parent(i);
            if (!this.cmp(this.heap[i], this.heap[p])) break;
            this.swap(i, p);
            i = p;
        }
    }

    private siftDown(i: number) {
        const n = this.heap.length;
        while (true) {
            const l = this.left(i), r = this.right(i);
            let m = i;
            if (l < n && this.cmp(this.heap[l], this.heap[m])) m = l;
            if (r < n && this.cmp(this.heap[r], this.heap[m])) m = r;
            if (m === i) break;
            this.swap(i, m);
            i = m;
        }
    }

    private swap(i: number, j: number) {
        const tmp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = tmp;
    }
}
