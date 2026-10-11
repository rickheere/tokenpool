# Project registry

Submit a pull request adding `owner--repository.json` containing `{"repository":"https://github.com/owner/repository"}`. Participation must also be enabled by `.github/tokenpool.json` on the original repository’s default branch. A fork cannot enroll its upstream. Registry acceptance does not certify repository safety.

The discovery workflow periodically proposes new register entries from GitHub search. It never merges them. The sync workflow validates upstream licenses, participation and pinned instructions every ten minutes, then sends authenticated snapshots to the coordinator. Before new claims, the coordinator also checks the upstream participation file. You can always submit a register PR directly instead of waiting for search indexing.
