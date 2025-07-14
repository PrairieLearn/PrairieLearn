export interface StatusMessage {
  variant_id: string;
  variant_token: string;
  file_name: string;
}

export interface StatusMessageWithFileContent {
  variant_id: string;
  file_name: string;
  file_content: string;
}
