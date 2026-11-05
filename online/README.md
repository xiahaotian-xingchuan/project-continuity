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

## Confirmed deliverables 0.3.0

Save and synchronize actual confirmed documents with save_confirmed_deliverable. Each object records its path, title, version, confirmation evidence, SHA-256 and immutable file bytes in private R2 storage. Repeating the same file is idempotent; changed content requires a new version. Download links serve the original bytes. Git synchronization includes these documents in the selected deliverables directory.

Project status snapshots remain available as secondary handoff exports. The primary Save and Synchronize panel lists substantive deliverables.

For a local machine, run bridge/save_deliverables.py with a selected folder and the private site's service credential supplied through CONTINUITY_ACCESS_TOKEN in that machine's environment. The bridge polls confirmed files, validates hashes, atomically saves them, and reports exact local paths. It preserves a manually modified file and reports a conflict. A browser opening the hosted board cannot by itself write an arbitrary computer folder.

Example invocation (after credential configuration):

python3 bridge/save_deliverables.py --site SITE_URL --folder LOCAL_FOLDER

Append --once for a one-time save. Both desktop and web can request the same online save action. Continuous local delivery requires the bridge to run on the target computer. Configure the actual folder and repository only after the user supplies those destinations.
