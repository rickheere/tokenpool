# Project registry

Submit a pull request adding `owner--repository.json` containing `{"repository":"https://github.com/owner/repository"}`. Participation must also be enabled by `.github/tokenpool.json` on the original repository's default branch. A fork cannot enroll its upstream. Registry acceptance does not certify repository safety.

Discovery and automated validation are not implemented yet. The intended scanner proposes registry PRs; it never silently enrolls projects.
