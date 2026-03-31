/**
 * 帮助文档浏览器数据模型
 * 定义文档注册表条目和标题信息的类型接口
 */

/** 文档注册表条目，支持最多三级嵌套 */
export interface DocRegistryItem {
  /** 文档唯一标识 */
  slug: string;
  /** 显示标题（i18n key 或直接文本） */
  titleKey: string;
  /** Markdown 内容（叶子节点才有） */
  content?: string;
  /** 子文档列表 */
  children?: DocRegistryItem[];
}

/** 从 Markdown 内容中提取的标题信息 */
export interface HeadingItem {
  /** 标题级别（2 或 3，对应 h2/h3） */
  level: 2 | 3;
  /** 标题文本 */
  text: string;
  /** 生成的锚点 ID（slugified） */
  id: string;
}
