import { Telegraf } from 'telegraf';
import { splitMessage } from '@gramio/split';
import { getFormattable } from '@gramio/format';
import type { MessageEntity as TelegramMessageEntity }
  from 'telegraf/types';
import { markdownToTelegramEntities, MessageEntity } from './markdownToTelegramEntities';

export class TelegramSender {
  constructor(private bot: Telegraf) { }

  async safeSendMessage(chatId: number, message: string, options: any = {}): Promise<any> {
    const limit = 4096;

    let lastMessage: any;
    const parsed = markdownToTelegramEntities(message);

    const botEntities = parsed.entities
      .map(convert)
      .filter(Boolean) as TelegramMessageEntity[];

    const msg = getFormattable(parsed.text);
    msg.entities = botEntities;

    await splitMessage(
      msg,
      async ({ text, entities }) => {
        lastMessage = await this.bot.telegram.sendMessage(chatId, text, {
          entities: entities as any,
          ...options
        });
        return lastMessage;
      },
      limit
    );

    return lastMessage;
  }

  async safeEditMessage(chatId: number, messageId: number, message: string, options: any = {}): Promise<any> {
    const limit = 4096;
    const parsed = markdownToTelegramEntities(message);
    const botEntities = parsed.entities
      .map(convert)
      .filter(Boolean) as TelegramMessageEntity[];

    // For edit, we can only edit the first message, so we truncate if needed
    if (message.length <= limit) {
      await this.bot.telegram.editMessageText(
        chatId,
        messageId,
        undefined,
        parsed.text,
        {
          entities: botEntities,
          ...options
        }
      );
      return { message_id: messageId }; // Return the edited message
    } else {
      // If too long for edit, delete old message and send new split messages
      await this.bot.telegram.deleteMessage(chatId, messageId);

      // Use split to send new messages
      return await this.safeSendMessage(chatId, message, options);
    }
  }
}

const map = {
  messageEntityBold: 'bold',
  messageEntityItalic: 'italic',
  messageEntityUnderline: 'underline',
  messageEntityStrike: 'strikethrough',
  messageEntitySpoiler: 'spoiler',
  messageEntityCode: 'code',
  messageEntityPre: 'pre',
  messageEntityTextUrl: 'text_link',
  messageEntityMentionName: 'text_mention',
  messageEntityUrl: 'url',
  messageEntityHashtag: 'hashtag',
  messageEntityCashtag: 'cashtag',
  messageEntityBotCommand: 'bot_command',
  messageEntityPhone: 'phone_number',
  messageEntityEmail: 'email',
  messageEntityCustomEmoji: 'custom_emoji',
  messageEntityBlockquote: 'blockquote',
} as const satisfies Record<string, TelegramMessageEntity['type']>;

function convert(
  e: MessageEntity,
): TelegramMessageEntity | null {
  const type = map[e.type as keyof typeof map];
  if (!type) return null;
  const base: TelegramMessageEntity = {
    type,
    offset: e.offset,
    length: e.length,
  } as TelegramMessageEntity;

  if (type === 'text_link' && 'url' in e) (base as any).url = e.url;
  if (type === 'pre' && 'language' in e) (base as any).language = e.language;
  if (type === 'text_mention' && 'user' in e) (base as any).user = (e as any).user;

  return base;
}