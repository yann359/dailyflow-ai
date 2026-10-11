export class AIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function providerError(status: number, body = '') {
  // Provider response bodies can contain prompts or credentials; classify, never return or log them.
  if (status === 401 || status === 403)
    return new AIError('auth', '密钥无效或没有访问权限，请在服务端检查配置。');
  if (
    status === 402 ||
    /insufficient|balance|credit|quota_exceeded|billing|resource_exhausted/i.test(
      body,
    )
  )
    return new AIError('credit', '服务商额度不足或配额已耗尽。');
  if (
    status === 404 ||
    /model_not_found|invalid_model|model.*not.*exist/i.test(body)
  )
    return new AIError('model', '模型不存在或此账号没有模型访问权限。');
  if (status === 429)
    return new AIError('rate', '服务商请求过于频繁，请稍后重试。', 429);
  return new AIError('error', '服务商拒绝请求，请检查模型能力和服务端配置。');
}
export function safeError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (
    error instanceof Error &&
    /timeout|abort/i.test(error.name + error.message)
  )
    return new AIError(
      'network',
      '模型请求超时；可能已产生用量，请勿反复提交。',
      504,
    );
  return new AIError('network', '模型网络或响应异常，记录未被修改。');
}
