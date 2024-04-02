- [VC - Central Server](#vc---central-server)
- [CONTRIBUTION](#contribution)
  - [Guidelines for forking, developing and opening a PR](#guidelines-for-forking-developing-and-opening-a-pr)

# VC - Central Server

# CONTRIBUTION

## Guidelines for forking, developing and opening a PR

1. This repo https://github.com/Velvet-Capital/velvet-central-server at this point will only contain 2 branches - `main` and `dev`. 
2. All feature additions go into `dev` branch and get merged into `main` once tested thorougly.
3. Fork this repo and create a feature branch from the `dev` branch for your feature additions. 
4. Name your fork's feature branch something like `feature/short-description`. For example, `fee/zeroex-integration`. 
5. Do not create multiple branchs for same piece of work. If 2 folks are working on the same feature together, they should coordinate and keep that branch updated for the PR it's meant to be included in. 
6. If you need your own copy of a feature branch, make sure that's in your fork of the repo, not in the main repo. 
7. You can ask a teammate to open a PR, then include your commits in that PR before it gets merged. Here's how you can add a commit to someone else's PR https://tighten.com/insights/adding-commits-to-a-pull-request/
8. For your forked repo's feature branch, when the feature addition is complete (and tested), open a PR from your fork's `feature/short-description` branch against the `dev` branch in main repo https://github.com/Velvet-Capital/velvet-central-server/tree/dev
9. Mention the branch of solver app https://github.com/Velvet-Capital/js-bebop-solver/ your PR works with. 
10. For central server get your environment vars aligned to https://github.com/Velvet-Capital/velvet-central-server/blob/main/env.example
11. for solver app, get your environment vars aligned to https://github.com/Velvet-Capital/js-bebop-solver/blob/main/env.example
