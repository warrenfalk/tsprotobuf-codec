import {allocateNestingWriter, simpleWriter, useSharedWriter, allocateSharedWriter} from "../src/writer";
import { ReadValue } from "../src/protobuf-codec-ts";
import { Readable, Writable, NestedWritable } from "../src/types";
import * as writeval from "../src/write-value";

const collect: (length: number, dumpTo: (output: Writable) => void) => Uint8Array
= (length, dumpTo) => {
    const buffer = new Uint8Array(length);
    const writer = simpleWriter(buffer);
    dumpTo(writer);
    // the length passed into the finish callback needs to match the length actually written
    const written = writer.length();
    if (written != length)
        throw `The finish callback must request exactly the number of bytes that it will write, but it requested ${length} and wrote ${written}`
    return buffer;
}

function reader(bytes: Uint8Array): Readable & {remain(): number} {
    let cursor = 0;
    return {
        isDone: () => cursor >= bytes.length,
        readByte: () => bytes[cursor++],
        readBlock: (length: number) => {
            const block = bytes.subarray(cursor, cursor + length);
            cursor += length;
            return block;
        },
        subreader: (length: number) => {
            const block = bytes.subarray(cursor, cursor + length);
            cursor += length;
            return reader(block);
        },
        remain: () => bytes.length - cursor,
    }
}

test('simple writer can write byte', () => {
    const buffer = new Uint8Array(3);
    const w = simpleWriter(buffer);
    w.writeByte(1);
    w.writeByte(2);
    expect(buffer[0]).toBe(1);
    expect(buffer[1]).toBe(2);
    expect(w.length()).toBe(2);
})

test('can allocate writer', () => {
    const w = allocateNestingWriter(100);
    expect(w).toBeTruthy();
})

const B = (s: string) => (new TextEncoder()).encode(s);

test('end without begin throws', () => {
    const w = allocateNestingWriter(500);
    w.begin();
    w.end();
    expect(() => w.end()).toThrow(/mismatch/);
})

test('begin without end throws', () => {
    const w = allocateNestingWriter(500);
    w.begin();
    expect(() => w.finish(() => {})).toThrow(/mismatch/);
})

test('can do write', () => {
    const w = allocateNestingWriter(500);
    w.writeBlock(B("0. Aliquam tincidunt mauris eu risus."));
    w.finish(collect);
})

test('reset after finish', () => {
    const w = allocateNestingWriter(500);
    w.begin();
    w.writeBlock(B("0. Aliquam tincidunt mauris eu risus."));
    w.end();
    const r1 = w.finish(collect);
    expect(r1.length).toBe(38)
    w.begin();
    w.writeBlock(B("0. Vestibulum auctor dapibus neque."));
    w.end();
    const r2 = w.finish(collect);
    expect(r2.length).toBe(36);
})

test('use shared writer works', () => {
    const result = useSharedWriter(writer => {
    });
    expect(result.length).toBe(0);
})

test('shared writer returns buffer', () => {
    const result = useSharedWriter(writer => {
        writer.begin();
        writer.end();
    });
    expect(result.length).toBe(1);
})

test("using shared writer cannot be nested", () => {
    expect(() => {
        useSharedWriter(writer => {
            useSharedWriter(writer2 => {});
        });
    }).toThrow(/in use/i);
})

// Nested write tests
// To do these, we'll build a small test harness that will write hierarchies of strings

type NestedStrings = NestedStringsList | string
type NestedStringsList = NestedStrings[]
function writeNested(w: NestedWritable, testCase: NestedStringsList) {
    for (const element of testCase) {
        if (typeof element === "string") {
            writeval.string(w, element);
        }
        else {
            w.begin();
            writeNested(w, element);
            w.end();
        }
    }
}

test('can write pattern w', () => {
    const w = allocateNestingWriter(500);
    const nested = [
        "0. Aliquam tincidunt mauris eu risus.", // 37
    ]
    writeNested(w, nested);
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(ReadValue.length(r)).toBe(37);
    expect(ReadValue.rawstring(r, 37)).toBe(nested[0]);
    expect(r.remain()).toBe(0);
})

test('can write pattern (w)', () => {
    const w = allocateNestingWriter(500);
    const nested = [
        [
            "1. Cras iaculis ultricies nulla.", // 32
        ],
    ]
    writeNested(w, nested);
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(ReadValue.length(r)).toBe(33);
    expect(ReadValue.length(r)).toBe(32);
    expect(ReadValue.rawstring(r, 32)).toBe(nested[0][0]);
    expect(r.remain()).toBe(0);
})

test('can write pattern w(w)', () => {
    const w = allocateNestingWriter(500);
    const nested = [
        "0. Aliquam tincidunt mauris eu risus.", // 37
        [
            "1. Cras iaculis ultricies nulla.", // 32
        ],
    ]
    writeNested(w, nested);
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(ReadValue.length(r)).toBe(37);
    expect(ReadValue.rawstring(r, 37)).toBe(nested[0]);
    expect(ReadValue.length(r)).toBe(33);
    expect(ReadValue.length(r)).toBe(32);
    expect(ReadValue.rawstring(r, 32)).toBe(nested[1][0]);
    expect(r.remain()).toBe(0);
})

test('can write pattern w(w)w', () => {
    const w = allocateNestingWriter(500);
    const nested = [
        "0. Aliquam tincidunt mauris eu risus.", // 37
        [
            "1. Cras iaculis ultricies nulla.", // 32
        ],
        "0. Vestibulum auctor dapibus neque." // 35
    ]
    writeNested(w, nested);
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(ReadValue.length(r)).toBe(37);
    expect(ReadValue.rawstring(r, 37)).toBe(nested[0]);
    expect(ReadValue.length(r)).toBe(33);
    expect(ReadValue.length(r)).toBe(32);
    expect(ReadValue.rawstring(r, 32)).toBe(nested[1][0]);
    expect(ReadValue.length(r)).toBe(35);
    expect(ReadValue.rawstring(r, 35)).toBe(nested[2])
    expect(r.remain()).toBe(0);
})

test('can write pattern w(ww)w', () => {
    const w = allocateNestingWriter(500);
    const nested = [
        "0. Aliquam tincidunt mauris eu risus.", // 37
        [
            "1. Cras iaculis ultricies nulla.", // 32
            "1. Cras ornare tristique elit.", // 30
        ],
        "0. Vestibulum auctor dapibus neque." // 35
    ]
    writeNested(w, nested);
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(ReadValue.length(r)).toBe(37);
    expect(ReadValue.rawstring(r, 37)).toBe(nested[0]);
    expect(ReadValue.length(r)).toBe(64);
    expect(ReadValue.length(r)).toBe(32);
    expect(ReadValue.rawstring(r, 32)).toBe(nested[1][0]);
    expect(ReadValue.length(r)).toBe(30);
    expect(ReadValue.rawstring(r, 30)).toBe(nested[1][1]);
    expect(ReadValue.length(r)).toBe(35);
    expect(ReadValue.rawstring(r, 35)).toBe(nested[2])
    expect(r.remain()).toBe(0);
})

test('can write pattern w()w', () => {
    const w = allocateNestingWriter(500);
    const nested = [
        "0. Aliquam tincidunt mauris eu risus.", // 37
        [],
        "0. Vestibulum auctor dapibus neque." // 35
    ]
    writeNested(w, nested);
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(ReadValue.length(r)).toBe(37);
    expect(ReadValue.rawstring(r, 37)).toBe(nested[0]);
    expect(ReadValue.length(r)).toBe(0);
    expect(ReadValue.length(r)).toBe(35);
    expect(ReadValue.rawstring(r, 35)).toBe(nested[2])
    expect(r.remain()).toBe(0);
})

test('can write pattern w(())w', () => {
    const w = allocateNestingWriter(500);
    const nested = [
        "0. Aliquam tincidunt mauris eu risus.", // 37
        [
            []
        ],
        "0. Vestibulum auctor dapibus neque." // 35
    ]
    writeNested(w, nested);
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(ReadValue.length(r)).toBe(37);
    expect(ReadValue.rawstring(r, 37)).toBe(nested[0]);
    expect(ReadValue.length(r)).toBe(1);
    expect(ReadValue.length(r)).toBe(0);
    expect(ReadValue.length(r)).toBe(35);
    expect(ReadValue.rawstring(r, 35)).toBe(nested[2])
    expect(r.remain()).toBe(0);
})

test('can write pattern w()()w', () => {
    const w = allocateNestingWriter(500);
    const nested = [
        "0. Aliquam tincidunt mauris eu risus.", // 37
        [],
        [],
        "0. Vestibulum auctor dapibus neque." // 35
    ]
    writeNested(w, nested);
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(ReadValue.length(r)).toBe(37);
    expect(ReadValue.rawstring(r, 37)).toBe(nested[0]);
    expect(ReadValue.length(r)).toBe(0);
    expect(ReadValue.length(r)).toBe(0);
    expect(ReadValue.length(r)).toBe(35);
    expect(ReadValue.rawstring(r, 35)).toBe(nested[3])
    expect(r.remain()).toBe(0);
})

test('can write pattern w((w))w', () => {
    const w = allocateNestingWriter(500);
    const nested = [
        "0. Aliquam tincidunt mauris eu risus.", // 37
        [
            [
                "2. Donec quis dui at dolor tempor interdum." // 43
            ]
        ],
        "0. Vestibulum auctor dapibus neque." // 35
    ]
    writeNested(w, nested);
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(ReadValue.length(r)).toBe(37);
    expect(ReadValue.rawstring(r, 37)).toBe(nested[0]);
    expect(ReadValue.length(r)).toBe(45);
    expect(ReadValue.length(r)).toBe(44);
    expect(ReadValue.length(r)).toBe(43);
    expect(ReadValue.rawstring(r, 43)).toBe(nested[1][0][0]);
    expect(ReadValue.length(r)).toBe(35);
    expect(ReadValue.rawstring(r, 35)).toBe(nested[2])
    expect(r.remain()).toBe(0);
})




test('can do complex nested writes', () => {
    const w = allocateNestingWriter(500);
    writeval.string(w, "0. Aliquam tincidunt mauris eu risus.");
    w.begin(); {
        writeval.string(w, "1. Cras iaculis ultricies nulla.");
        w.begin(); {
            writeval.string(w, "2. Donec quis dui at dolor tempor interdum.")
            w.begin(); {
                w.begin(); {
                    writeval.string(w, "4. Lorem ipsum dolor sit amet, consectetuer adipiscing elit.")
                }
                w.end();
                writeval.string(w, "3. Fusce pellentesque suscipit nibh.")
            }
            w.end();
        }
        w.end();
        writeval.string(w, "1. Cras ornare tristique elit.");
        w.begin(); {
            // write nothing here, but this should be treated like an empty message
        }
        w.end();
    }
    w.end();
    writeval.string(w, "0. Vestibulum auctor dapibus neque.")
    writeval.string(w, "0. Vestibulum commodo felis quis tortor.")
    writeval.string(w, "0. Vivamus vestibulum ntulla nec ante.")
    const collected = w.finish(collect);

    const r0 = reader(collected);
    expect(collected.length).toBe(367);

    expect(ReadValue.string(r0)).toBe("0. Aliquam tincidunt mauris eu risus.");
    const r1 = ReadValue.sub(r0);
    expect(ReadValue.string(r1)).toBe("1. Cras iaculis ultricies nulla.");
    const r2 = ReadValue.sub(r1);
    expect(ReadValue.string(r2)).toBe("2. Donec quis dui at dolor tempor interdum.")
    const r3 = ReadValue.sub(r2);
    const r4 = ReadValue.sub(r3);
    expect(ReadValue.string(r4)).toBe("4. Lorem ipsum dolor sit amet, consectetuer adipiscing elit.")
    expect(ReadValue.string(r3)).toBe("3. Fusce pellentesque suscipit nibh.")
    expect(ReadValue.string(r1)).toBe("1. Cras ornare tristique elit.");
    const _r1b = ReadValue.sub(r1);
    expect(ReadValue.string(r0)).toBe("0. Vestibulum auctor dapibus neque.")
    expect(ReadValue.string(r0)).toBe("0. Vestibulum commodo felis quis tortor.")
    expect(ReadValue.string(r0)).toBe("0. Vivamus vestibulum ntulla nec ante.")

    expect(collect.length).toBe(2);
})

test('can overfill the writer 1', () => {
    const w = allocateNestingWriter(20);
    writeval.string(w, "0. Aliquam tincidunt mauris eu risus.");
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(collected.length).toBe(38);
})

test('can overfill the writer 2', () => {
    const w = allocateNestingWriter(10);
    writeval.string(w, "0. Aliquam tincidunt mauris eu risus.");
    const collected = w.finish(collect);
    const r = reader(collected);
    expect(collected.length).toBe(38);
})

test('can overfill the writer 3', () => {
    const w = allocateNestingWriter(10);
    for (let i = 0; i < 20; i++)
        writeval.int32(w, i);
        const collected = w.finish(collect);
    const r = reader(collected);
    expect(collected.length).toBe(20);
})


test('can allocate shared writer', () => {
    const w = allocateSharedWriter(1024);
    expect(w).toBeTruthy();
})