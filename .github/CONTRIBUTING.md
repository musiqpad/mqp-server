# How to contribute

I'm really glad you're reading this, because we need volunteer developers to help this project come to fruition.

If you haven't already, come find us in [Discord](https://mqp.io/discord). We want you working on things you're excited about.

## Guideline Contents

- [Raising Issues](#reporting-an-issue)

  - [Bug Reports](#bug-reports)
  - [Feature Requests](#features)
  - [Submitting Pull Requests](#submitting-pull-requests)

### Reporting an issue

The GitHub issue tracker is the preferred channel for bug reports, change requests and submitting pull requests, but please respect the following restrictions:

- Please check if a similar issue already exists
- For personal support requests, please contact us on [Discord](https://mqp.io/discord)

## Bug Reports

If you find a bug, please follow these Guidelines:

- Check if the issue already has been reported using the github issue search
- Try to reproduce the bug using the latest release build
- Include as much info as possible!
- Include details about your environment

## Feature Requests

If you've got a great idea, we want to hear about it. Before making a suggestion, here are a few tips on what to consider:

- Check if something similar already has been requested
- Try to provide as much detail and context as possible

## Submitting Pull Requests

It's awesome that you want to help by creating a PR! If there isn't already an issue for your feature/bugfix, think about creating one first. This can help getting feedback and more more information. Guidelines:

- Always send PRs to the 'develop' branch!
- Try to name your branch after this schema:

  Bugfix: `bugfix/mybugfix`

  Feature: `feature/myfeature`

- Please ensure that bugfixes work on both `master (stable)` and `develop (unstable)`

- Always write a clear log message for your commits. One-line messages are fine for small changes, but bigger changes should look like this:

  ```
  $ A brief summary of the commit
  > 
  > closes #Issue
  > - A paragraph describing what changed and its impact
  ```

- Also, try to clean up your git history or we'll squash and merge.
