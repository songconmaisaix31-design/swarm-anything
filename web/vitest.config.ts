import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/api/swa.test.ts', 'src/api/transport.test.ts', 'src/pages/swarm/swaObservation.test.ts', 'src/pages/swarm/swaRoles.test.ts', 'src/pages/swarm/swaQuestionAnswer.test.ts', 'src/utils/__tests__/commandError.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
