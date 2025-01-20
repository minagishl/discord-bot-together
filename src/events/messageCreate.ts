import { Events, type Message } from "discord.js";
import Together from "together-ai";
import {
  containsTrendOrSynonyms,
  getTodayTrendsInJapanese,
} from "../utils/trend";

const rateLimitMap = new Map();

const together = new Together();

const allowedServers = process.env.ALLOWED_SERVERS?.split(",") ?? [];

// Store conversation history
const conversationHistory: Record<
  string,
  Array<{ role: "user" | "assistant" | "system" | "tool"; content: any }>
> = {};

export default {
  name: Events.MessageCreate,
  async execute(message: Message): Promise<void> {
    if (message.mentions.has(message.client.user)) {
      if (
        message.guildId !== null &&
        !allowedServers.includes(message.guildId)
      ) {
        await message.reply(
          "I am not allowed to respond in this server. Please contact the administrator.",
        );
        return;
      }

      if (
        message.content.includes("@here") ||
        message.content.includes("@everyone")
      ) {
        return;
      }

      const exceededUsers = process.env.EXCLUDED_USERS?.split(",") ?? [];
      if (exceededUsers.includes(message.author.id)) {
        await message.reply(
          "You are not allowed to use this bot. Please contact the administrator.",
        );
        return;
      }

      const userRateLimit: boolean = rateLimitMap.get(message.author.id);
      if (userRateLimit) {
        await message.reply(
          "You are sending too many requests. Please wait a moment and try again.",
        );
        console.log(`${message.author.id} | message is currently restricted.`);
        return;
      }

      // Set the rate limit to true
      rateLimitMap.set(message.author.id, true);

      if (message.content.length > 250) {
        await message.reply(
          "Your message is too long. Please keep it under 250 characters.",
        );
        return;
      }

      // Array to store URLs of attached files
      const attachmentUrls: string[] = [];

      if (message.attachments.size > 0) {
        // Loop through attachments
        message.attachments.forEach((attachment) => {
          // Check if it is an image file by MIME type
          if (attachment.contentType?.startsWith("image/")) {
            // Add the URL of the image to the array
            attachmentUrls.push(attachment.url);
          }
        });
      }

      if (message.inGuild() && message.channel.isTextBased()) {
        void message.channel.sendTyping();
      }

      // Remove bot's mention and trim content
      const contentWithoutBotMention = message.content
        .replace(new RegExp(`<@!?${message.client.user.id}>`), "")
        .trim();

      // Extract mentions of other users
      const otherMentions = message.mentions.users.filter(
        (user) => user.id !== message.client.user.id,
      );

      const mentionedUsersInfo = otherMentions
        .map((user) => {
          const member = message.guild?.members.cache.get(user.id);
          const nickname = member?.nickname != null || "No nickname";
          const roles = member?.roles.cache.map((role) => role.name).join(", ");
          return `User ${user.username} (Id: ${user.id}, Nickname: ${nickname}, Roles: ${roles})`;
        })
        .join("; ");

      const botName = message.client.user.username;

      const today = new Date();
      const formattedDate = today.toISOString().split("T")[0];
      const daysOfWeek = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const dayOfWeek = daysOfWeek[today.getDay()];
      const currentTime = today.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const userId = message.author.id;

      // Initialize or update the conversation history
      if (conversationHistory[userId] === undefined) {
        conversationHistory[userId] = [];
      }

      conversationHistory[userId].push({
        role: "user",
        content: contentWithoutBotMention,
      });

      // Keep only the last 5 messages for context
      if (conversationHistory[userId].length > 5) {
        conversationHistory[userId].shift();
      }

      const isTrend = containsTrendOrSynonyms(contentWithoutBotMention);

      let trends: string[] = [];
      if (process.env.ENABLE_TREND === "true" && isTrend) {
        trends = await getTodayTrendsInJapanese();
      }

      try {
        const systemMessage = `Always respond in Japanese and in one concise line. The bot's name is ${botName}. Today is ${formattedDate} (${dayOfWeek}). The current time is ${currentTime}.`;

        const userMentionInfo =
          mentionedUsersInfo.length > 0
            ? `The message mentions the following users: ${mentionedUsersInfo}.`
            : "";

        const buildMessage = (): string => {
          const parts = [systemMessage];

          if (userMentionInfo.length > 0) {
            parts.push(userMentionInfo);
          }

          if (trends.length > 0) {
            parts.push("Trends: " + trends.join(", "));
          }

          return parts.join(" ");
        };

        const content = buildMessage();

        const messages = [
          {
            role: "system" as const,
            content,
          },
          ...conversationHistory[userId],
        ];

        if (attachmentUrls.length > 0) {
          messages.push({
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: attachmentUrls[0],
                },
              },
            ],
          });
        }

        const chatCompletion = await together.chat.completions.create({
          messages,
          model:
            attachmentUrls.length > 0
              ? "meta-llama/Llama-Vision-Free"
              : "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
        });

        if (chatCompletion.choices[0].message === undefined) {
          await message.reply(
            "An error occurred while processing your request.",
          );
          return;
        }

        const data = chatCompletion.choices[0].message.content;

        if (data === null) {
          await message.reply(
            "An error occurred while processing your request.",
          );
        } else {
          const sanitizedData = data.replace(/@(everyone|here)/g, '[at]$1');
          await message.reply(sanitizedData);

          // Add the assistant's response to the history
          conversationHistory[userId].push({
            role: "assistant",
            content: data,
          });
        }
      } catch (error) {
        console.error("Fetch error:", error);
      }

      setInterval(() => {
        rateLimitMap.delete(message.author.id);
      }, 5000);
    }
  },
};
