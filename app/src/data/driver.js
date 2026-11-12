export const json = {
    enc: (v) => JSON.stringify(v ?? null),
    dec: (s, fallback) => {
        if (typeof s !== 'string')
            return fallback;
        try {
            return (JSON.parse(s) ?? fallback);
        }
        catch {
            return fallback;
        }
    },
};
export const bool = (v) => v === 1 || v === true;
export const num = (v) => (v === null || v === undefined ? undefined : Number(v));
export const str = (v) => (v === null || v === undefined ? undefined : String(v));
