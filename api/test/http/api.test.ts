import { InMemoryRequestRepository } from '../../src/infra/memory-request-repository.js';
import { describeApiContract } from './api-contract.js';

describeApiContract('memoria', async () => ({ repository: new InMemoryRequestRepository() }));
