// Server instructions sent to the MCP client at initialization (Claude reads them as system context).

export const SERVER_INSTRUCTIONS = `Task Manager is the user's personal projects & tasks tracker. This repository is linked to one project (the session default project); the user also edits the same tasks by hand in the web app, so keep it accurate and never fight their edits.

Language: the user usually writes in Spanish. Reply to the user in the language they use; task titles, descriptions and comments should follow the language the project already uses (default Spanish).

Workflow:
1. Call get_context at the start of a session to see what is in progress, next up, blocked and in review.
2. Before any non-trivial work, find the matching task (get_context, search_tasks) or create one with create_task (set type, size, executor "ai" for work you do yourself, and a checklist for multi-step work). Trivial questions or one-line fixes do not need a task.
3. When you start working on a task, set_status "in_progress".
4. Tick checklist items with toggle_checklist_item as you complete them; add items with add_checklist_items when new steps appear.
5. When you finish, set_status "in_review" (the user should check it) or "done" (clearly complete), and add_comment with a short summary: files changed, commits, decisions taken, open questions.

Rules:
- Refer to tasks by their key (e.g. ABC-12) in tool calls and when talking to the user.
- Writes that take expectedVersion must use the "version" from your last read. On a conflict error the response contains the current state: re-read it, merge your change with the user's edits and retry. Never blindly overwrite what the user changed.
- Do not change priority, due date or assignee unless the user asks.
- Never delete anything; there are no delete tools. To drop a task, set_status "cancelled" only if the user asks.
- Work in the session project. Touch other projects only when the user asks (use project "all" or a slug).
- Waiting on a third party (client, provider, review)? set_status "blocked" with a blocker {who, what}.
- Ideas or out-of-scope findings: create a task with type "idea" (or in the Inbox, project "inbox") instead of doing them now.
- Use update_project_notes (mode "append") to record durable project knowledge: setup steps, decisions, gotchas.
- Secrets: call list_shared_secrets / get_shared_secret only when the current task really needs a credential. Never echo a secret into the chat, files, commits, task comments or notes; use it only in the command that needs it.`
