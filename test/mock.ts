import { Writable, NestedWritable } from "../src/types";
import { int32 } from "../src/write-value";

export type TestableWritable = Writable & {
    toHexString: () => string,
    count: () => number,
}

// Mock Writable
export const writable: () => NestedWritable & TestableWritable
= () => {
    const buffers: number[][] = [[]];

    const writer: TestableWritable = {
        count: () => buffers[0].length,
        writeByte: (b) => {
            if (b < 0 || b > 255)
                throw new Error(`Attempt to write byte with out of range value ${b}`)
            buffers[0].push(b)
        },
        writeBlock: (block) => {
            const bytes = new Uint8Array(block);
            for (let b of bytes)
                buffers[0].push(b);
        },
        toHexString: () => buffers[0]
            .map((b: number) => b.toString(16).padStart(2, "0"))
            .join(""),
    }

    return {
        ...writer,
        begin: () => {
            buffers.unshift([]);
        },
        end: () => {
            if (buffers.length === 1)
                throw new Error("end() without begin()")
            const done = buffers.shift()!;
            const length = done.length;
            int32(writer, length);
            writer.writeBlock(new Uint8Array(done));
        }

    }
}

