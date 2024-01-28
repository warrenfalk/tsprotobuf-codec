import { writable } from "./mock";
import * as write from "../src/write-value"

test('write int32 0 consumes 1 byte', () => {
    const w = writable();
    write.int32(w, 0);
    expect(w.count()).toBe(1);
})

for (let i = 1; i < 6; i++) {
    const low = 1 * Math.pow(128, i - 1);
    const high = 1 * Math.pow(128, i) - 1;
    test(`write int32 ${low} consumes ${i} bytes`, () => {
        const w = writable();
        write.int32(w, low);
        expect(w.count()).toBe(i);
    })

    test(`write int32 ${high} consumes ${i} bytes`, () => {
        const w = writable();
        write.int32(w, high);
        expect(w.count()).toBe(i);
    })
}

test('write int32 1234567 results in correct bytes', () => {
    const w = writable();
    write.int32(w, 1234567);
    expect(w.toHexString()).toBe("87ad4b");
})

test('write int32 269670023 results in correct bytes', () => {
    const w = writable();
    write.int32(w, 269670023);
    expect(w.toHexString()).toBe("87adcb8001");
})

test('write int32 0x12345678 results in correct bytes', () => {
    const w = writable();
    write.int32(w, 0x12345678);
    expect(w.toHexString()).toBe("f8acd19101");
})

test('write varint32 0x76543210 results in correct bytes', () => {
    const w = writable();
    write.int32(w, 0x76543210);
    expect(w.toHexString()).toBe("90e4d0b207");
})

