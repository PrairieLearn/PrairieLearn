import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function CourseAgentMarkdown({ children }: { children: string }) {
  return (
    <div className="course-agent-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
