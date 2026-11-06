#![allow(
    clippy::too_many_arguments,
    clippy::type_complexity,
    clippy::collapsible_if,
    clippy::needless_borrows_for_generic_args
)]

mod analysis_cache;
pub mod automation;
pub mod config;
mod extraction;
pub mod migration;
pub mod policy;
pub mod provider;
pub mod rag;
mod rag_scope;
pub mod tools;

pub use config::{AiRuntimeConfig, ModelBinding, ModelRole, ProviderConfig, ProviderKind};
pub use provider::{ProviderError, ProviderRouter};
pub use rag::{AiStore, RagSearchItem};
