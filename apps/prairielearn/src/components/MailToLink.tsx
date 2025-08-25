export function MailToLink({
  email,
  subject,
  body,
}: {
  email: string | null;
  subject: string;
  body: string;
}) {
  if (!email) return '-';
  return (
    <a
      href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
    >
      {email}
    </a>
  );
}
