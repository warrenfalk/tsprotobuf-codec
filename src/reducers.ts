export type Reducer<TState, TEvent> = (state: TState | undefined, event: TEvent) => TState;

export function keepLast<TResponse>(): Reducer<TResponse, TResponse> {
    return reduceKeepLast;
};

export function keepAll<TResponse>(): Reducer<TResponse[], TResponse> {
    return reduceKeepAll;
}

type KeyedState<TRecord extends {key: string, value: any}> = TRecord[]

export function keepLastByKey<TResponse extends {records: TRecord[]}, TRecord extends {key: string, value: any} = TResponse["records"][0]>(): Reducer<KeyedState<TRecord>, TResponse> {
    return (state, response) => {
        const delta = response.records;
        if (!state) {
            return delta;
        }
        const next = [];
        const index = new Map<string, TRecord>();
        for (const record of delta) {
            index.set(record.key, record);
        }
        for (const record of state) {
            const drecord = index.get(record.key);
            index.delete(record.key);
            if (!drecord) {
                next.push(record);
            }
            else if (drecord.value !== undefined) {
                next.push(drecord);
            }
        }
        for (const record of index.values()) {
            if (record.value) {
                next.push(record);
            }
        }
        return next;
    }
}

function reduceKeepLast<TResponse>(state: TResponse | undefined, response: TResponse): TResponse {
    return response;
}

function reduceKeepAll<TResponse>(state: TResponse[] | undefined, response: TResponse): TResponse[] {
    return state ? [...state, response] : [response];
}

