import { Conversation } from '../models/Conversation.js';
import { createCrudRouter } from './crudFactory.js';

export default createCrudRouter(Conversation, {
  resourceName: 'Conversation',
  populate: ['companyId', 'contactId', 'assignedTo'],
  canWrite: ['ADMIN', 'SUPERVISOR', 'CALLCENTER']
});
