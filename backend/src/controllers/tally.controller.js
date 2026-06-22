import tallyCompatibilityService from '../services/tallyCompatibility.service.js';
import logger from '../config/logger.js';

class TallyController {
  async exportVouchers(req, res) {
    try {
      const result = await tallyCompatibilityService.exportVouchers({
        ...req.body,
        userId: req.user._id,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async exportMasters(req, res) {
    try {
      const result = await tallyCompatibilityService.exportMasters(req.body.companyId, req.user._id);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async exportOpeningBalances(req, res) {
    try {
      const result = await tallyCompatibilityService.exportOpeningBalances(
        req.body.companyId, req.body.financialYear, req.user._id
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async exportGSTData(req, res) {
    try {
      const result = await tallyCompatibilityService.exportGSTData(
        req.body.period, req.body.financialYear, req.user._id
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async importVouchers(req, res) {
    try {
      const result = await tallyCompatibilityService.importVouchers({
        ...req.body,
        userId: req.user._id,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async importMasters(req, res) {
    try {
      const result = await tallyCompatibilityService.importMasters({
        ...req.body,
        userId: req.user._id,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async validateMigrationReadiness(req, res) {
    try {
      const result = await tallyCompatibilityService.validateMigrationReadiness(req.body.companyId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}

export default new TallyController();
