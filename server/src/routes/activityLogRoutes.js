import { ActivityLog } from '../models/ActivityLog.js';
import { createCrudRouter } from './crudFactory.js';

export default createCrudRouter(ActivityLog, {
  resourceName: 'ActivityLog',
  populate: ['companyId', 'userId'],
  canWrite: ['ADMIN', 'SUPERVISOR', 'CALLCENTER']
});
