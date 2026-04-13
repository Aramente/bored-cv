interface Props {
  role: "assistant" | "user";
  content: string;
}

export default function ChatMessage({ role, content }: Props) {
  return (
    <div className={`chat-msg ${role}`}>
      <div className="chat-bubble">{content}</div>
    </div>
  );
}
