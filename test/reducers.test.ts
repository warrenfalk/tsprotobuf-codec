import {keepLast, keepAll, keepLastByKey} from "../src/reducers";
import { string } from "../src/write-value";

describe('keepLast', () => {
    it('keeps only last item', () => {
        const reduce = keepLast<string>()
        const s1 = reduce(undefined, "first");
        expect(s1).toEqual("first");
        const s2 = reduce(s1, "second");
        expect(s2).toEqual("second");
    })
})

describe('keepAll', () => {
    it('keeps all items', () => {
        const reduce = keepAll<string>();
        const s1 = reduce(undefined, "first");
        expect(s1).toEqual(["first"]);
        const s2 = reduce(s1, "second");
        expect(s2).toEqual(["first", "second"]);
    })
})

describe('keepLastByKey', () => {
    it('keeps last of each key', () => {
        const reduce = keepLastByKey<{records: {key: string, value: string | undefined}[]}>();
        const s1 = reduce(undefined, {records: [
            {key: "one", "value": "uno"},
            {key: "two", "value": "dos"},
            {key: "three", "value": "tres"},
            {key: "four", "value": "cuatro"},
        ]});
        expect(s1).toEqual([
            {key: "one", "value": "uno"},
            {key: "two", "value": "dos"},
            {key: "three", "value": "tres"},
            {key: "four", "value": "cuatro"},
        ]);
        const s2 = reduce(s1, {records: [
            {key: "five", "value": "vagh"}, // this should be added
            {key: "three", "value": "wej"}, // this should be modified
            {key: "one", "value": "wa'"}, // this should be modified
            {key: "two", "value": undefined}, // this should be removed
            // {key: "four", "value": "cuatro"}, // this should be unchanged
            {key: "six", "value": undefined}, // this should do nothing
        ]});
        expect(s2).toEqual([
            {key: "one", "value": "wa'"},
            {key: "three", "value": "wej"},
            {key: "four", "value": "cuatro"},
            {key: "five", "value": "vagh"},
        ])
    })
})