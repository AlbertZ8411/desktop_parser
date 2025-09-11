// tests/integration/LLMService.integration.test.js
const LLMService = require('../../src/services/llm-service');
require('dotenv').config(); // 加载环境变量

// 标记为集成测试，可以在CI/CD中选择性跳过
describe('LLMService Integration', () => {
    let llmService;

    beforeEach(() => {
        // 使用实际配置创建服务
        llmService = new LLMService({
            baseUrl: process.env.LLM_API_URL || 'http://localhost:11434',
            model: process.env.LLM_MODEL || 'gpt-oss:20b',
            temperature: 0.1, // 低温度使结果更可预测，适合测试
            maxTokens: 100 // 限制响应长度，加快测试
        });
    });

    // 这个测试会实际调用LLM服务
    test('should connect to local LLM service and get response', async () => {
        // 如果测试环境不允许集成测试，跳过
        if (process.env.SKIP_INTEGRATION_TESTS) {
            console.log('Skipping integration test');
            return;
        }

        // 发送简单查询
        const result = await llmService.query(
            'You are a test assistant',
            'Return the exact text: "INTEGRATION_TEST_SUCCESS"'
        );

        // 验证连接成功且返回了预期内容
        expect(result.success).toBe(true);
        expect(result.data).toContain('INTEGRATION_TEST_SUCCESS');
    }, 30000); // 给予足够超时时间，LLM生成可能较慢

    test('should handle JSON response format', async () => {
        if (process.env.SKIP_INTEGRATION_TESTS) return;

        const result = await llmService.query(
            'You are a JSON generator',
            'Return a JSON object with key "status" and value "ok"',
            { responseFormat: { type: 'json_object' } }
        );

        expect(result.success).toBe(true);
        // 检查是否返回了JSON对象
        expect(result.data).toHaveProperty('status');
        expect(result.data.status).toBe('ok');
    }, 30000);
});
