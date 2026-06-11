const globalShutdown = globalThis as typeof globalThis & {
  __shortlinkShutdownTasks?: Set<(reason: string) => Promise<void>>;
};

function shutdownTasks() {
  if (!globalShutdown.__shortlinkShutdownTasks) {
    globalShutdown.__shortlinkShutdownTasks = new Set();
  }
  return globalShutdown.__shortlinkShutdownTasks;
}

export function registerServerShutdownTask(
  task: (reason: string) => Promise<void>,
) {
  shutdownTasks().add(task);
}

export async function runServerShutdownTasks(reason: string) {
  await Promise.all(
    [...shutdownTasks()].map(async (task) => {
      try {
        await task(reason);
      } catch (error) {
        console.error('An error occurred during shutdown work.', error);
      }
    }),
  );
}
