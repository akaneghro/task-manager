import { getTask } from '../../../../services/tasks'
import type { TaskDetailDto } from '../../../../../shared/types/dto'

/** Public task detail: no comments, no hidden dependencies, no capabilities. */
export default defineServiceHandler(async (event): Promise<TaskDetailDto> => {
  const actor = await publicActorFromToken(event, routeParam(event, 'token'))
  const detail = await getTask(serviceContext(event, actor), routeParam(event, 'key'))
  return { ...detail, comments: [], commentCount: 0, hiddenDependencies: 0 }
})
