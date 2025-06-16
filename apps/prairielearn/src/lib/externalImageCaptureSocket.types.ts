export interface StatusMessage {
  variant_id: string;
  variant_token: string;
  file_name: string;
}

export interface StatusMessageWithFileContent extends StatusMessage {
  file_content: string;
}
