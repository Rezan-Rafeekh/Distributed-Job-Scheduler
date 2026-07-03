// Job.sequence is a Postgres bigint (mapped to native BigInt by Prisma) used
// for cheap monotonic keyset pagination. Neither JSON.stringify nor Fastify's
// default serializer know how to handle BigInt, so any route returning a raw
// Job object would 500. Patching toJSON globally is the standard fix — every
// BigInt serializes as its decimal string, which is what API consumers need
// anyway (JS numbers can't safely represent it beyond 2^53).
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

export {};
