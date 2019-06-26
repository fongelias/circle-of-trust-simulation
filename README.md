# Circle Of Trust Simulation

## Questions
How many code owners do we need per section of code?

## Assumptions
 - When a review is submitted, the requested changes are immediately made
 - Reviews happen concurrently
 - A PR is merged when required number of reviewers have reviewed it
 - Reviewers are mutually exclusive from developers
 - Only one developer will work on a single task at a time
 - For all random rolls, assume a normal distribution from the mean

## Considerations/Future Considerations
 - Imperfect reviewers: they make mistakes x% of the time
 - Imperfect developers: they make mistakes x% of the time
 - Time for review: how long does it take to review T tasks with R reviewers?
 - Time to review: how long does it take for a review to begin?
 - Mistakes are only merged if all reviewers miss it