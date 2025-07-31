import { marked, Token, TokensList, Tokens } from 'marked';

// Define the MessageEntity interface based on Telegram's types
export interface MessageEntity {
    type: string; // e.g., 'messageEntityBold'
    offset: number;
    length: number;
    url?: string;
    language?: string;
    // user_id?: number; // For messageEntityMentionName - not covered in standard Markdown
    // document_id?: string; // For messageEntityCustomEmoji - not covered in standard Markdown
}

export interface ParseResult {
    text: string;
    entities: MessageEntity[];
}

// Helper function to get UTF-16 length (used by Telegram for offsets and lengths)
// For standard JavaScript strings, str.length is already UTF-16 code units count.
// This function is kept for clarity and potential future needs if string handling becomes more complex.
export function getUtf16Length(str: string): number {
    return str.length;
}

export function markdownToTelegramEntities(markdownText: string): ParseResult {
    const tokens = marked.lexer(markdownText, { gfm: true, breaks: true });

    let plainText = '';
    const entities: MessageEntity[] = [];

    function processTokens(tokenList: Token[] | TokensList | undefined) {
        // TokensList for top-level
        if (!tokenList) {
            return;
        }

        // marked.lexer returns TokensList, which is an array with a 'links' property.
        // We only want to iterate over the array part.
        const iterableTokens = Array.isArray(tokenList) ? tokenList : [];

        for (const token of iterableTokens) {
            const startOffset = getUtf16Length(plainText);

            let entityType: string | null = null;
            const entityProps: Partial<MessageEntity> = {};

            switch (token.type) {
                case 'paragraph':
                    processTokens((token as Tokens.Paragraph).tokens);
                    // Add line break after paragraph unless it's the last token
                    if (iterableTokens.indexOf(token) < iterableTokens.length - 1) {
                        plainText += '\n\n';
                    }
                    break;
                case 'strong':
                    entityType = 'messageEntityBold';
                    processTokens((token as Tokens.Strong).tokens);
                    break;
                case 'em':
                    entityType = 'messageEntityItalic';
                    processTokens((token as Tokens.Em).tokens);
                    break;
                case 'del':
                    entityType = 'messageEntityStrike';
                    processTokens((token as Tokens.Del).tokens);
                    break;
                case 'codespan':
                    entityType = 'messageEntityCode';
                    plainText += (token as Tokens.Codespan).text;
                    break;
                case 'code': {
                    // Fenced code block - Added block scope
                    entityType = 'messageEntityPre';
                    const codeToken = token as Tokens.Code;
                    // Ensure language is always set, even if empty
                    entityProps.language = codeToken.lang?.trim() || '';

                    let codeText = codeToken.text;
                    // Normalize line endings from marked's output
                    codeText = codeText.replace(/\r\n/g, '\n');
                    codeText = codeText.replace(/\r/g, '\n');

                    plainText += codeText;
                    break;
                }
                case 'link': {
                    entityType = 'messageEntityTextUrl';
                    const linkToken = token as Tokens.Link;
                    entityProps.url = linkToken.href;
                    processTokens(linkToken.tokens);
                    break;
                }
                case 'blockquote': {
                    entityType = 'messageEntityBlockquote';
                    const bqToken = token as Tokens.Blockquote;
                    if (bqToken.tokens) {
                        const childTokens = bqToken.tokens;
                        childTokens.forEach((childToken: Token, index: number) => {
                            const textBeforeChild = plainText;
                            processTokens([childToken]);
                            if (
                                plainText.length > textBeforeChild.length &&
                                index < childTokens.length - 1
                            ) {
                                const nextToken = childTokens[index + 1];
                                if (
                                    nextToken &&
                                    [
                                        'paragraph',
                                        'list',
                                        'blockquote',
                                        'code',
                                        'heading',
                                    ].includes(nextToken.type)
                                ) {
                                    plainText += '\n';
                                }
                            }
                        });
                    }
                    break;
                }
                case "list": {
                    const listToken = token as Tokens.List;

                    if (plainText && !plainText.endsWith("\n")) {
                        plainText += "\n";
                    }

                    const before = plainText.length;

                    listToken.items.forEach((item, index) => {
                        plainText += listToken.ordered ? `${index + 1}. ` : "•  ";

                        processTokens(item.tokens);

                        plainText = plainText.replace(/\n+$/, "");
                        plainText += "\n";
                    });

                    if (plainText.length > before) {
                        plainText = plainText.replace(/\n$/, "\n\n");
                    }

                    plainText = plainText.replace(/\n{3,}/g, "\n\n");
                    break;
                }
                case 'heading':
                    entityType = 'messageEntityBold';
                    processTokens((token as Tokens.Heading).tokens);
                    // Add line break after heading unless it's the last token
                    if (iterableTokens.indexOf(token) < iterableTokens.length - 1) {
                        plainText += '\n\n';
                    }
                    break;
                case 'hr':
                    break;
                case 'br':
                    plainText += '\n';
                    break;
                case 'text':
                    if ((token as Tokens.Text).tokens) {
                        processTokens((token as Tokens.Text).tokens);
                    } else {
                        plainText += (token as Tokens.Text).text;
                    }
                    break;
                case 'html':
                    break;
                case 'space': {
                    break;
                }
                default:
                    // Attempt to handle generic tokens with 'tokens' or 'text' properties
                    if (
                        'tokens' in token &&
                        token.tokens &&
                        Array.isArray(token.tokens)
                    ) {
                        processTokens(token.tokens);
                    } else if ('text' in token && typeof token.text === 'string') {
                        plainText += token.text;
                    }
                    break;
            }

            if (entityType) {
                const currentTextLength = getUtf16Length(plainText) - startOffset;

                if (currentTextLength > 0) {
                    entities.push({
                        type: entityType,
                        offset: startOffset,
                        length: currentTextLength,
                        ...entityProps,
                    } as MessageEntity);
                }
            }
        }
    }

    processTokens(tokens); // Pass the top-level TokensList here

    return { text: plainText, entities };
}