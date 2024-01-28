import { Writable, NestingTranslator } from "./types";
import { int32 } from "./write-value";

// With Protocol Buffers it is not possible to know at what offset you will write a length-prefixed thing
// unless you already know the length of that length-prefixed thing.
// This is because the lengths themselves are variable width, and must come before the thing they prefix
// And so you do not know how many bytes to skip before starting to write the content part of length-prefixed content.

// So we define here two writing interfaces.
// One can only write consecutive bytes in order, so the caller must manage figuring out length-prefixed content
// The other has "begin" and "end" and will manage this for you, but is much more complicated to implement.

// There are multiple possible strategies to implement this, but this file provides a class that does a reasonably
// good job of reducing memory allocations by using a largish working buffer to hold all of the data and then on
// the call to "finish" it will dump it all to a regular consecutive stream.

// Note that this implementation will keep a permanent buffer of "capacity" size, but will create new buffers if necessary
// if the need arises to write larger messages.

// Note that the capacity refers only to the message content capacity,
// there are an index and a stack that allocate additional memory internally

let protoWriter: NestingTranslator & Clearable | undefined = undefined;

export function allocateSharedWriter(capacity: number = 16384): NestingTranslator & Clearable {
    protoWriter =  allocateNestingWriter(capacity);
    return protoWriter;
}

let sharedWriterInUse: boolean = false;
export function useSharedWriter(callback: (w: NestingTranslator) => void): Uint8Array {
    const writer = protoWriter ? protoWriter : allocateSharedWriter();
    if (sharedWriterInUse || !writer.isEmpty())
        throw new Error("Attempt to use shared writer that is already in use");
        sharedWriterInUse = true;
    try {
        callback(writer);
        const result = writer.finish(arrayCollector);
        sharedWriterInUse = false;
        return result;
    }
    catch (e) {
        writer.clear();
        sharedWriterInUse = false;
        throw e;
    }
}

interface Clearable {
    clear(): void,
    isEmpty(): boolean,
}

export function allocateNestingWriter(capacity: number): NestingTranslator & Clearable {
    const permanentBuffer = new Uint8Array(capacity);
    let buffer = permanentBuffer;
    let cursor = 0;
    const index: number[] = [];
    const levelStack: number[] = [];
    let written = 0;
    let uncommitted = 0;

    function reset() {
        buffer = permanentBuffer;
        index.splice(0, index.length);
        levelStack.splice(0, levelStack.length);
        written = 0;
        uncommitted = 0;
        cursor = 0;
    }

    function growTo(newSize: number) {
        const newBuffer = new Uint8Array(newSize);
        newBuffer.set(buffer.subarray(0, cursor));
        buffer = newBuffer;
    }

    const commit = () => {
        if (uncommitted > 0) {
            index.push(cursor - uncommitted);
            index.push(uncommitted);
            written += uncommitted;
            uncommitted = 0;
        }
    }

    const begin = () => {
        commit();
        levelStack.push(written);
        levelStack.push(index.length);
        index.push(-1);
        index.push(-1);
        written = 0;
    };
    const writable: Writable = {
        writeByte: (b: number) => {
            if (cursor == buffer.length) {
                growTo(buffer.length * 2);
            }
            buffer[cursor++] = b;
            uncommitted++;
        },
        writeBlock: (block) => {
            const bytes = new Uint8Array(block);
            const newSize = cursor + bytes.length;
            if (newSize > buffer.length) {
                growTo(Math.max(newSize, buffer.length * 2));
            }
            buffer.set(bytes, cursor);
            cursor = newSize;
            uncommitted += bytes.length;
        }
    }
    const end = () => {
        commit();
        const length = written;
        const start = levelStack.pop();
        const stashedBytes = levelStack.pop();
        if (start === undefined || stashedBytes === undefined) {
            throw new Error("mismatched begin/end, end without begin");
        }
        index[start] = cursor;
        int32(writable, length);
        index[start + 1] = uncommitted;
        written = stashedBytes + uncommitted + length;
        uncommitted = 0;
    };


    return {
        begin: begin,
        end: end,
        ...writable,
        finish: (callback) => {
            if (levelStack.length !== 0) {
                throw new Error("mismatched begin/end, begin without end");
            }
            commit();
            const finalSize = written;
            const result = callback(finalSize, (stream) => {
                for (let i = 0; i < index.length; i += 2) {
                    const start = index[i];
                    const len = index[i + 1];
                    const source = buffer.subarray(start, start + len);
                    stream.writeBlock(source);
                }
            })
            reset();
            return result;
        },
        clear: reset,
        isEmpty: () => cursor == 0 && levelStack.length == 0,
    }
}

export function arrayCollector(length: number, dumpTo: (stream: Writable) => void): Uint8Array {
    const array = new Uint8Array(length);
    let cursor = 0;
    dumpTo(simpleWriter(array));
    return array;
}

export function simpleWriter(buffer: Uint8Array): Writable & {length(): number} {
    let cursor = 0;
    return {
        writeByte: (b) => {
            buffer[cursor++] = b;
        },
        writeBlock: (block) => {
            const bytes = new Uint8Array(block);
            buffer.set(bytes, cursor);
            cursor += bytes.length;
        },
        length: () => cursor,
    }
}
