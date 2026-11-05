# Project Continuity Online 0.2.0

Private online board shared by ChatGPT web and desktop. D1 stores the current project, proposal and revision history. All clients use the same REST and MCP actions. The board refreshes every three seconds, preserving edits and rejecting stale writes.

## Deployment

Uses the Sites Vinext starter, D1 binding DB, schema-only Drizzle migration, and the Sites private access boundary. Keep the Site owner-private. Project records are imported through initialize after deployment and are excluded from source.

The Site publishes a personal plugin with open_project_board, read_project and update_project. Open the returned board URL to use the interactive UI.

## Git

Optional runtime secret GITHUB_TOKEN authorizes a selected GitHub repository. Configure repository and branch through the UI. Only the project snapshot and handoff under .project-continuity/<project-id>/ are committed. Pushes use a parent commit and non-forced ref update. After saves, Git mode with a configured secret attempts synchronization. A failed push leaves the online revision available and marks Git pending. Buttons also support manual retry. Without the secret, the app explains that Git authorization is missing.

## Exports

Both clients download project-state.json and PROJECT_STATUS.md from the same revision. Desktop folder background writes are not included in this web application.

## Verification

node --test tests/project.test.mjs
node node_modules/typescript/bin/tsc --noEmit
