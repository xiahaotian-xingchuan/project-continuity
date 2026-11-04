---
name: project-continuity
description: Maintain confirmed plans, milestones, stage requirements, and handoff files for a long-running project. Use when starting, resuming, updating, or handing off a tracked project.
---

Use `scripts/project.py` in this skill, with Python 3.11+ on a machine that can access the project directory. Always specify the absolute project directory. Read PROJECT_STATUS.md and run `show` before taking action. Resolve the project explicitly if ambiguous. See `python3 scripts/project.py --help` and the repository README.

- Keep background and general reference in the existing Page. Record project-specific operative requirements and their source references here.
- Start with `init`. Show the user the proposed plan, milestone tree, completion criteria, and scoped requirements. Save proposals with `propose`, then apply the exact proposal ID with `confirm` only after explicit user confirmation. Show a revised diff and get confirmation again if the revision changed.
- For progress, record active milestone IDs, next steps, blockers and pending decisions with `progress`. Only mark completion after checking the confirmed criterion and identifying an artifact or other verifiable evidence. Do not invent status, evidence, or authorization.
- Read applicable requirements (global and milestone ancestors) before acting. Surface contradictions for confirmation.
- After writes inspect the returned revision and sync state. Explain a pending sync or conflict and provide the local handoff path. Never force push. Do not place project data in the plugin source repository.
- Run `serve` to open a live local board. Keep the server running while viewing it. The hosted sample uses fictional data.
