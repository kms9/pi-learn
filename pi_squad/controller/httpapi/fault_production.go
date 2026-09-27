//go:build !pisquad_integration

package httpapi

import "github.com/gin-gonic/gin"

func (s *Server) faultRoutes(*gin.RouterGroup) {}
