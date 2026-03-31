/**
 * DocContent - Markdown 内容渲染组件
 * 位于页面中间，将 Markdown 源文件渲染为可视化内容
 * 使用 react-markdown + remark-gfm 渲染，为标题生成 slug ID 支持锚点导航
 */

import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '../../i18n/I18nContext';
import { slugify, extractHeadings } from '../../utils/docUtils';
import type { HeadingItem } from '../../types/docs';

interface DocContentProps {
  /** Markdown 原始文本 */
  content: string;
  /** 标题提取回调，渲染完成后上报标题列表 */
  onHeadingsExtracted: (headings: HeadingItem[]) => void;
  /** 内容区域滚动容器 ref，供 TocNav 监听 */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** 加载错误信息 */
  error: string | null;
}

/** 从 React children 中提取纯文本 */
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText((children as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return '';
}

/** 创建带 slug ID 的标题组件 */
function HeadingRenderer({ level, children, ...props }: any) {
  const text = extractText(children);
  const id = slugify(text);
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;

  const styles: Record<number, string> = {
    1: 'text-2xl font-bold mt-8 mb-4 pb-2 border-b',
    2: 'text-xl font-semibold mt-6 mb-3',
    3: 'text-lg font-medium mt-5 mb-2',
    4: 'text-base font-medium mt-4 mb-2',
    5: 'text-sm font-medium mt-3 mb-1',
    6: 'text-sm font-medium mt-3 mb-1 opacity-80',
  };

  return (
    <Tag
      id={id}
      className={styles[level] || ''}
      style={{ color: 'var(--app-text)', borderColor: 'var(--app-border)' }}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** react-markdown 自定义组件映射 */
const markdownComponents = {
  h1: (props: any) => <HeadingRenderer level={1} {...props} />,
  h2: (props: any) => <HeadingRenderer level={2} {...props} />,
  h3: (props: any) => <HeadingRenderer level={3} {...props} />,
  h4: (props: any) => <HeadingRenderer level={4} {...props} />,
  h5: (props: any) => <HeadingRenderer level={5} {...props} />,
  h6: (props: any) => <HeadingRenderer level={6} {...props} />,
  p: (props: any) => <p className="mb-4 leading-relaxed" style={{ color: 'var(--app-text)' }} {...props} />,
  ul: (props: any) => <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />,
  ol: (props: any) => <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />,
  li: (props: any) => <li className="mb-1 leading-relaxed" style={{ color: 'var(--app-text)' }} {...props} />,
  blockquote: (props: any) => (
    <blockquote
      className="border-l-4 pl-4 py-1 my-4 rounded-r"
      style={{ borderColor: 'var(--app-active-border)', backgroundColor: 'var(--app-hover)' }}
      {...props}
    />
  ),
  code: ({ className, children, ...props }: any) => {
    const isBlock = /language-(\w+)/.test(className || '');
    if (isBlock) {
      return (
        <div className="my-4 rounded-lg overflow-hidden">
          <div className="p-4 font-mono text-sm overflow-x-auto" style={{ backgroundColor: 'var(--app-bg-elevated)', color: 'var(--app-text)' }}>
            <code className={className} {...props}>{children}</code>
          </div>
        </div>
      );
    }
    return (
      <code
        className="px-1.5 py-0.5 rounded text-sm font-mono"
        style={{ backgroundColor: 'var(--app-bg-elevated)', color: 'var(--app-active-text)' }}
        {...props}
      >
        {children}
      </code>
    );
  },
  a: ({ href, children, ...props }: any) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="underline transition-colors"
      style={{ color: 'var(--app-active-text)' }}
      {...props}
    >
      {children}
    </a>
  ),
  img: ({ src, alt, ...props }: any) => (
    <img src={src} alt={alt} className="max-w-full h-auto my-4 rounded-lg" {...props} />
  ),
  table: (props: any) => (
    <div className="overflow-x-auto my-4">
      <table className="w-full border-collapse" style={{ borderColor: 'var(--app-border)' }} {...props} />
    </div>
  ),
  thead: (props: any) => <thead style={{ backgroundColor: 'var(--app-bg-elevated)' }} {...props} />,
  tr: (props: any) => <tr className="border-b" style={{ borderColor: 'var(--app-border)' }} {...props} />,
  th: (props: any) => <th className="px-4 py-2 text-left font-semibold" style={{ color: 'var(--app-text)' }} {...props} />,
  td: (props: any) => <td className="px-4 py-2" style={{ color: 'var(--app-text-muted, var(--app-text))' }} {...props} />,
};

const DocContent: React.FC<DocContentProps> = ({ content, onHeadingsExtracted, scrollRef, error }) => {
  const { t } = useI18n();

  // 内容变化时提取标题
  useEffect(() => {
    if (content) {
      const headings = extractHeadings(content);
      onHeadingsExtracted(headings);
    } else {
      onHeadingsExtracted([]);
    }
  }, [content, onHeadingsExtracted]);

  // 错误状态
  if (error || !content) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ color: 'var(--app-text-muted)' }}
      >
        <p>{error || t('docs.loadError' as any)}</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-6"
    >
      <div className="max-w-4xl mx-auto">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default DocContent;
