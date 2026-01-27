/**
 * Web mock for expo-task-manager
 * Task manager is not supported on web, so these are no-ops
 */

const registeredTasks: Map<string, (body: any) => any> = new Map();

export function defineTask(
  taskName: string,
  taskExecutor: (body: { data: any; error: any }) => any
): void {
  registeredTasks.set(taskName, taskExecutor);
  console.warn(`[TaskManager] Task "${taskName}" defined but won't run on web`);
}

export async function isTaskRegisteredAsync(taskName: string): Promise<boolean> {
  return registeredTasks.has(taskName);
}

export async function getTaskOptionsAsync(taskName: string): Promise<any> {
  return null;
}

export async function getRegisteredTasksAsync(): Promise<Array<{ taskName: string; taskType: string }>> {
  return Array.from(registeredTasks.keys()).map(taskName => ({
    taskName,
    taskType: 'web-mock',
  }));
}

export async function unregisterTaskAsync(taskName: string): Promise<void> {
  registeredTasks.delete(taskName);
}

export async function unregisterAllTasksAsync(): Promise<void> {
  registeredTasks.clear();
}

export default {
  defineTask,
  isTaskRegisteredAsync,
  getTaskOptionsAsync,
  getRegisteredTasksAsync,
  unregisterTaskAsync,
  unregisterAllTasksAsync,
};
