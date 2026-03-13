/**
 * 模型格式校验与备用模型列表操作工具函数
 */

/**
 * 校验 provider/model 格式
 * @param value 待校验的字符串
 * @returns 格式是否合法（包含 /，且 / 前后均非空）
 */
export function isValidModelFormat(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes('/')) {
    return false;
  }
  
  const parts = trimmed.split('/');
  // 至少要有两部分，且第一部分（provider）非空，后续部分拼接后（model）非空
  return parts.length >= 2 && 
         parts[0].trim() !== '' && 
         parts.slice(1).join('/').trim() !== '';
}

/**
 * 添加备用模型到列表（幂等操作，已存在则返回原列表）
 * @param fallbacks 当前备用模型列表
 * @param model 要添加的模型（provider/model 格式）
 * @returns 新的备用模型列表
 */
export function addFallback(fallbacks: string[], model: string): string[] {
  // 如果已存在，返回原列表（幂等）
  if (fallbacks.includes(model)) {
    return fallbacks;
  }
  
  // 追加到列表末尾
  return [...fallbacks, model];
}

/**
 * 从备用模型列表中移除指定条目
 * @param fallbacks 当前备用模型列表
 * @param model 要移除的模型
 * @returns 新的备用模型列表
 */
export function removeFallback(fallbacks: string[], model: string): string[] {
  return fallbacks.filter(m => m !== model);
}
