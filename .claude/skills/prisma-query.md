# Skill: prisma-query

Help write optimized Prisma queries for this project. Enforce select-only, no N+1, proper transaction use.

## Trigger
`/prisma-query`

## Instructions

When invoked, ask the user:
1. Which model / operation? (e.g. "list assessments with store info", "bulk upsert scores")
2. What data is needed in the response? (to determine minimal `select`)
3. Any filtering / pagination / sorting?
4. Is it part of a transaction?

Then produce:

### Repository Method
- Place in the correct `*.repository.ts`
- Use `select` — never return full model unless explicitly required
- Use `include` only for related data actually needed
- Paginate with `skip` + `take` derived from page/limit
- Use `Promise.all([findMany, count])` for paginated list (parallel queries)
- For upserts: use `upsert` with compound key
- For bulk ops: use `createMany` / `updateMany` — not a loop of individual queries
- Wrap multi-step writes in `$transaction`

### Typed Input/Output
- Input: `Prisma.XxxWhereInput`, `Prisma.XxxOrderByWithRelationInput`, etc.
- Return type: explicit TypeScript type or Prisma `GetResult` where appropriate

### N+1 Check
Before finalizing, check: is there any loop over query results that fires another query? If yes, replace with `include` or a single `IN` query.

### Index Hint
If the query filters on a non-primary/non-unique field used often, note which field should have `@@index` added to the Prisma schema.

## Example Output Format

```ts
// stores.repository.ts

async findAll(params: {
  page: number;
  limit: number;
  province?: string;
  status?: StoreStatus;
  search?: string;
}): Promise<[StoreListItem[], number]> {
  const where: Prisma.StoreWhereInput = {
    ...(params.province && { province: params.province }),
    ...(params.status && { status: params.status }),
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { ownerName: { contains: params.search } },
      ],
    }),
  };

  return Promise.all([
    this.prisma.store.findMany({
      where,
      select: {
        id: true, name: true, province: true, storeType: true,
        ownerName: true, phone: true, status: true, createdAt: true,
      },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.store.count({ where }),
  ]);
}
```
