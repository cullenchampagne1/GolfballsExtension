// Custom Action setup:
//   Runs on: Custom
//   Entry point: .gb-task-list-modal
//
// Task List supplies every loaded task row as page.tasks.items. This action
// moves the live date to one week before the due date only when the task is
// more than two weeks out. The confirmation preview lists the task edits
// before anything is written to the CRM.

const cutoff = new Date();
cutoff.setHours(12, 0, 0, 0);
cutoff.setDate(cutoff.getDate() + 14);

let changed = 0;

for (const task of page.tasks.items) {
  if (!task.id || !task.dueDate) continue;

  const due = new Date(`${task.dueDate}T12:00:00`);
  if (Number.isNaN(due.getTime()) || due <= cutoff) continue;

  const live = new Date(due);
  live.setDate(live.getDate() - 7);

  task.liveDate = live;
  changed++;
}

return `Updated ${changed} task${changed === 1 ? '' : 's'}`;
