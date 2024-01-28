import {Helpers as H, WriteField as F} from '../src/protobuf-codec-ts'

describe('once', () => {
    it('only runs a function once', () => {
        const fn = jest.fn(() => "value");
        const o = H.once(fn);
        expect(fn).toBeCalledTimes(0);
        const result1 = o();
        expect(result1).toBe("value");
        expect(fn).toBeCalledTimes(1);
        const result2 = o();
        expect(result2).toBe("value");
        expect(fn).toBeCalledTimes(1);
    })
})