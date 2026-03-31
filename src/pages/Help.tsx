import React, { useState, useEffect } from 'react';
import { BookOpen, FileText, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

// 导入帮助文档
import USER_GUIDE from '../help-docs/USER_GUIDE.md?raw';
import FEATURE_LIST from '../help-docs/FEATURE_LIST.md?raw';

const Help: React.FC = () => {
  const { t } = useI18n();
  const [activeDoc, setActiveDoc] = useState('user-guide');
  const [docContent, setDocContent] = useState<string>('');
  const [toc, setToc] = useState<Array<{ id: string; text: string; level: number }>>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // 文档列表
  const docs = [
    { id: 'user-guide', title: t('userGuide'), icon: BookOpen, content: USER_GUIDE },
    { id: 'feature-list', title: t('featureList'), icon: FileText, content: FEATURE_LIST },
  ];

  // 加载文档内容
  useEffect(() => {
    const loadDocContent = async () => {
      const selectedDoc = docs.find(doc => doc.id === activeDoc);
      if (selectedDoc) {
        try {
          const response = await fetch(selectedDoc.content);
          const text = await response.text();
          setDocContent(text);
          // 生成目录
          const headers = extractHeaders(text);
          setToc(headers);
          // 初始化所有章节为展开状态
          const initialExpanded = headers.reduce((acc, header) => {
            acc[header.id] = true;
            return acc;
          }, {} as Record<string, boolean>);
          setExpandedSections(initialExpanded);
        } catch (error) {
          console.error('Failed to load document:', error);
          setDocContent(t('failedToLoadDocument'));
        }
      }
    };

    loadDocContent();
  }, [activeDoc, t]);

  // 从 markdown 中提取标题，生成目录
  const extractHeaders = (content: string): Array<{ id: string; text: string; level: number }> => {
    const headers = [];
    const headerRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;

    while ((match = headerRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-').replace(/--+/g, '-');
      
      headers.push({
        id,
        text,
        level,
      });
    }

    return headers;
  };

  // 切换章节展开/收起
  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 跳转到指定标题
  const scrollToHeader = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // 自定义 markdown 渲染组件
  const components = {
    h1: ({ node, ...props }: any) => {
      const id = props.children[0]?.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-').replace(/--+/g, '-');
      return <h1 id={id} className="text-3xl font-bold mt-8 mb-4 text-tech-cyan border-b-2 border-tech-green pb-2" {...props} />;
    },
    h2: ({ node, ...props }: any) => {
      const id = props.children[0]?.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-').replace(/--+/g, '-');
      return <h2 id={id} className="text-2xl font-semibold mt-6 mb-3 text-tech-green" {...props} />;
    },
    h3: ({ node, ...props }: any) => {
      const id = props.children[0]?.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-').replace(/--+/g, '-');
      return <h3 id={id} className="text-xl font-medium mt-5 mb-2 text-tech-cyan" {...props} />;
    },
    p: ({ node, ...props }: any) => <p className="mb-4 leading-relaxed" {...props} />,
    ul: ({ node, ...props }: any) => <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />,
    li: ({ node, ...props }: any) => <li className="mb-1 leading-relaxed" {...props} />,
    blockquote: ({ node, ...props }: any) => <blockquote className="border-l-4 border-tech-cyan pl-4 py-1 my-4 bg-tech-cyan/5 rounded-r" {...props} />,
    code: ({ node, className, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      return match ? (
        <div className="my-4 rounded-lg overflow-hidden">
          <div className="bg-gray-800 text-gray-200 p-4 font-mono text-sm overflow-x-auto">
            <code className={className} {...props} />
          </div>
        </div>
      ) : (
        <code className="bg-gray-800 text-tech-cyan px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
      );
    },
    a: ({ node, href, ...props }: any) => {
      if (href && href.startsWith('http')) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-tech-cyan hover:text-tech-green transition-colors flex items-center gap-1"
            {...props}
          />
        );
      }
      return <a className="text-tech-cyan hover:text-tech-green transition-colors" {...props} />;
    },
    img: ({ node, src, alt, ...props }: any) => (
      <img
        src={src}
        alt={alt}
        className="max-w-full h-auto my-4 rounded-lg shadow-md"
        onError={(e) => {
          // 图片加载失败时显示占位符
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const placeholder = document.createElement('div');
          placeholder.className = 'w-full h-48 bg-gray-800 flex items-center justify-center rounded-lg my-4';
          placeholder.innerHTML = `
            <div class="text-gray-400 flex flex-col items-center gap-2">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span class="text-sm">${alt || t('imagePlaceholder')}</span>
            </div>
          `;
          target.parentNode?.replaceChild(placeholder, target);
        }}
        {...props}
      />
    ),
    table: ({ node, ...props }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="w-full border-collapse border border-gray-700" {...props} />
      </div>
    ),
    thead: ({ node, ...props }: any) => (
      <thead className="bg-gray-800" {...props} />
    ),
    tbody: ({ node, ...props }: any) => (
      <tbody className="bg-gray-900" {...props} />
    ),
    tr: ({ node, ...props }: any) => <tr className="border-b border-gray-700" {...props} />,
    th: ({ node, ...props }: any) => <th className="px-4 py-2 text-left font-semibold text-tech-cyan" {...props} />,
    td: ({ node, ...props }: any) => <td className="px-4 py-2 text-gray-300" {...props} />,
  };

  return (
    <div className="h-full flex flex-col bg-app-bg text-app-text">
      <div className="border-b border-app-border p-4">
        <h1 className="text-2xl font-bold text-tech-cyan flex items-center gap-2">
          <BookOpen size={24} />
          {t('helpCenter')}
        </h1>
        <p className="text-app-text-muted mt-1">{t('helpCenterDescription')}</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 文档导航 */}
        <div className="w-64 border-r border-app-border bg-app-bg-elevated overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4 text-tech-green">{t('documentation')}</h2>
            <div className="space-y-1">
              {docs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setActiveDoc(doc.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-200
                    ${activeDoc === doc.id
                      ? 'bg-app-active-bg text-app-active-text border border-app-active-border'
                      : 'text-app-text-muted hover:bg-app-hover hover:text-app-text'
                    }`}
                >
                  <doc.icon size={18} />
                  <span className="font-medium">{doc.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 目录 */}
          {toc.length > 0 && (
            <div className="p-4 border-t border-app-border">
              <h2 className="text-lg font-semibold mb-4 text-tech-green">{t('tableOfContents')}</h2>
              <div className="space-y-1">
                {toc.map((item) => (
                  <div key={item.id} className="group">
                    <button
                      onClick={() => {
                        if (item.level === 1) {
                          toggleSection(item.id);
                        } else {
                          scrollToHeader(item.id);
                        }
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-200
                        ${item.level === 1
                          ? 'font-semibold text-app-text'
                          : 'text-app-text-muted hover:text-app-text'
                        }`}
                      style={{ paddingLeft: `${(item.level - 1) * 16}px` }}
                    >
                      {item.level === 1 && (
                        <div className="flex-shrink-0">
                          {expandedSections[item.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                      )}
                      <span>{item.text}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 文档内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {docContent ? (
            <div className="max-w-4xl mx-auto">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={components}
              >
                {docContent}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-app-text-muted">
              <div className="text-center">
                <BookOpen size={64} className="mx-auto mb-4 text-tech-cyan/50" />
                <p className="text-lg">{t('loadingDocument')}</p>
                <p className="text-sm mt-2">{t('pleaseWait')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Help;
