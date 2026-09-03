import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function CourseAgentMarkdown({ children }: { children: string }) {
  return (
    <div className="course-agent-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            /^https?:\/\//i.test(href ?? '') ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <>{children}</>
            ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
