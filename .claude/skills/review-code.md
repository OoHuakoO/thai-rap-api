# Backend Code Review Checklist

## Critical

Check:

* Security vulnerabilities
* Authentication bypass
* Authorization issues
* SQL Injection
* Sensitive data exposure
* Missing validation

## Architecture

Verify:

* Controller contains no business logic
* Service contains business logic
* Repository handles database access

Flag violations.

## DTO Validation

Verify:

* DTO exists
* Validation decorators exist
* ValidationPipe is respected

## Error Handling

Verify:

* Exceptions are handled properly
* Internal errors are not exposed
* Response format is consistent

## Database

Verify:

* No N+1 queries
* Proper indexing considerations
* Transactions where needed

Flag:

* unnecessary queries
* duplicated queries

## Prisma

Verify:

* select only required fields
* avoid over-fetching
* avoid unnecessary joins

## API Design

Verify:

* REST conventions
* status codes
* pagination support
* filtering support

## Performance

Check:

* unnecessary loops
* duplicated DB calls
* excessive await chains

## Security

Verify:

* passwords hashed
* tokens protected
* secrets not logged
* user input validated

## Logging

Verify:

* useful logs exist
* sensitive data not logged

## Testing

Verify:

* unit tests exist
* edge cases covered
* negative cases covered

## Severity Levels

Critical

* Security issue
* Data corruption risk
* Authentication issue

Major

* Architecture violation
* Performance issue
* Missing validation

Minor

* Naming issue
* Style issue

Suggestion

* Refactoring opportunity
* Readability improvement

Output Format:

## Critical

## Major

## Minor

## Suggestions
