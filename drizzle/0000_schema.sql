CREATE TABLE `users` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `display_name` varchar(255),
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `users_id` PRIMARY KEY(`id`),
  CONSTRAINT `users_email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `address` varchar(42) NOT NULL,
  `encrypted_private_key` varchar(512) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `wallets_id` PRIMARY KEY(`id`),
  CONSTRAINT `wallets_address_idx` UNIQUE(`address`),
  CONSTRAINT `wallets_user_idx` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
  CONSTRAINT `refresh_tokens_token_idx` UNIQUE(`token_hash`),
  CONSTRAINT `refresh_tokens_user_idx` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transfer_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `idempotency_key_hash` varchar(64) NOT NULL,
  `amount` bigint NOT NULL,
  `destination_address` varchar(42) NOT NULL,
  `transaction_hash` varchar(66),
  `status` enum('pending','completed') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `transfer_requests_id` PRIMARY KEY(`id`),
  CONSTRAINT `transfer_requests_user_key_idx` UNIQUE(`user_id`,`idempotency_key_hash`),
  CONSTRAINT `transfer_requests_user_idx` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
