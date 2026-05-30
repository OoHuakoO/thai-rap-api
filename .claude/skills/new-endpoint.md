# Skill: new-endpoint

Add a new endpoint to an existing module following all project conventions.

## Trigger
`/new-endpoint`

## Instructions

Ask the user for:
1. Which module? (e.g. `auth`, `stores`, `assessments`)
2. HTTP method + path? (e.g. `GET /stores/:id/summary`)
3. Is it public or JWT-protected?
4. What does it do? (brief description)

Then implement:

### Controller (`<name>.controller.ts`)
- Add the route handler with correct HTTP decorator
- `@Public()` if public, `@ApiBearerAuth()` if protected
- `@ApiOperation({ summary: '...' })` and `@ApiResponse(...)` for each possible response
- `@CurrentUser()` if the handler needs the authenticated user
- Return raw data only

### Service (`<name>.service.ts`)
- Add the business logic method
- Import and throw exceptions from `@common/exceptions/app.exception` with correct error codes

### Repository (`<name>.repository.ts`)
- Add any new Prisma query needed
- Use typed Prisma types

### DTO (if needed)
- New body or query DTO with `class-validator` + `@ApiProperty()` on every field

## Output
Show a summary of every file changed and the lines added/modified.
