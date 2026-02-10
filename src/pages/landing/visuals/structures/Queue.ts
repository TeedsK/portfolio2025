// src/pages/landing/visuals/structures/Queue.ts
// Re-definition of your original queue.js for parity.
// This is not used by the canvas solver, which relies on PriorityQueue.

export class Queue<T = unknown> {
    private data: T[] = [];
    add(item: T) { this.data.push(item); }
    get_priority(): T {
        this.sort();
        const result = this.data[0];
        this.data.splice(0, 1);
        return result;
    }
    sort(compare?: (a: any, b: any) => number) {
        if (compare) this.data.sort(compare);
        else this.data.sort((a: any, b: any) => (a[0] - b[0]) || (a[1] - b[1]));
    }
    isEmpty() { return this.data.length === 0; }
    print() { console.log(this.data); }
}
