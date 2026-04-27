import signalEngineService from '../services/signalEngine.service.js';
import logger from '../config/logger.js';

// @desc    Get cash flow signal from ledger only
// @route   GET /api/v1/signals/cash-flow
// @access  Private
export const getCashFlowSignal = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const signal = await signalEngineService.calculateCashFlow(startDate, endDate);

    res.json({
      success: true,
      data: signal,
    });
  } catch (error) {
    logger.error('Get cash flow signal error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get signal snapshot from ledger only
// @route   GET /api/v1/signals/snapshot
// @access  Private
export const getSignalSnapshot = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const snapshot = await signalEngineService.getSignalSnapshot(startDate, endDate);

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    logger.error('Get signal snapshot error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
