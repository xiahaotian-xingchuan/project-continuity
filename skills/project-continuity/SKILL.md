---
name: project-continuity
description: Maintain confirmed plans, milestones, stage requirements, and handoff files for a long-running project. Use when starting, resuming, updating, or handing off a tracked project.
---

For an online project, use the connected online project tools first. Save and synchronize refers to confirmed substantive deliverables such as the charter, governance rules, approved conclusions and reports. Save actual original file bytes with the artifact save tool, recording version, confirmation evidence and source. Project-status files are secondary handoff exports.

When asked to show the board, call open_project_board and provide/open its interactive URL. Read the latest project revision before saving. Use save_confirmed_deliverable when available, or update_project with action type save_artifact and the same fields. An explicit request to save confirmed work should trigger saving the actual deliverable file to configured destinations and checking receipts.

Use only the user's configured output folder and deliverables repository. A successful online archive does not establish local-folder or Git success. A local bridge must run on the target computer for automatic folder delivery. Explain any missing destination or authorization precisely.

The following commands support legacy local project status. Use `scripts/project.py` in this skill, with Python 3.11+ on a machine that can access the project directory. Always specify the absolute project directory. Read PROJECT_STATUS.md and run `show` before taking action. Resolve the project explicitly if ambiguous. See `python3 scripts/project.py --help` and the repository README.

- Keep background and general reference in the existing Page. Record project-specific operative requirements and their source references here.
- Start with `init`. Show the user the proposed plan, milestone tree, completion criteria, and scoped requirements. Save proposals with `propose`, then apply the exact proposal ID with `confirm` only after explicit user confirmation. Show a revised diff and get confirmation again if the revision changed.
- For progress, record active milestone IDs, next steps, blockers and pending decisions with `progress`. Only mark completion after checking the confirmed criterion and identifying an artifact or other verifiable evidence. Do not invent status, evidence, or authorization.
- Read applicable requirements (global and milestone ancestors) before acting. Surface contradictions for confirmation.
- After writes inspect the returned revision and sync state. Explain a pending sync or conflict and provide the local handoff path. Never force push. Do not place project data in the plugin source repository.
- Run `serve` to open a live local board. Keep the server running while viewing it. The hosted sample uses fictional data.
