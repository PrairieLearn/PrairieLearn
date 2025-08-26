export function MailToLink({
  email,
  uid,
  subject,
  body,
}: {
  email: string | null;
  uid: string | null;
  subject: string;
  body: string;
}) {
  if (!email && !uid) return '-';
  return (
    <a
      href={`mailto:${email ?? uid}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
    >
      {email ?? uid}
    </a>
  );
}
