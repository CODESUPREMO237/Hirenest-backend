// ============================================================================
// AGENDA SCHEDULER
// src/config/scheduler.js
// ============================================================================

const Agenda = require('agenda');
const logger = require('./logger');
const reconciliationService = require('../services/reconciliation.service');
const escrowService = require('../services/escrow.service');

let agenda;

const initializeScheduler = async (mongoUri) => {
  agenda = new Agenda({ db: { address: mongoUri, collection: 'agendaJobs' } });

  // Define jobs
  agenda.define('reconcile_pending_payments', async (job) => {
    logger.info('⏰ Agenda Triggered: reconcile_pending_payments');
    await reconciliationService.reconcilePendingPayments();
  });

  agenda.define('auto_release_escrow', async (job) => {
    logger.info('⏰ Agenda Triggered: auto_release_escrow');
    // Using the same logic that startAutoReleaseJob used via setInterval
    await escrowService.processAutoRelease(); 
  });

  // Start agenda
  await agenda.start();
  logger.info('✅ Agenda scheduler started');

  // Schedule jobs
  // Reconcile stuck payments every hour (you could do daily or every 15 min depending on volume)
  await agenda.every('1 hour', 'reconcile_pending_payments');
  
  // Auto release escrow every day
  await agenda.every('24 hours', 'auto_release_escrow');
};

const gracefulShutdown = async () => {
  if (agenda) {
    await agenda.stop();
    logger.info('Agenda scheduler stopped');
  }
};

module.exports = {
  initializeScheduler,
  gracefulShutdown
};
